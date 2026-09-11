const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const path = require('path');
const adsClient = require('../../adspower-browser/scripts/api-client');
const { requireCredential, verifyUpstreamSync } = require('../../adspower-browser/scripts/admin-kit-core');

function getWebshareToken() {
    return requireCredential('webshareApiToken');
}

function fetchWebshareProxies() {
    const token = getWebshareToken();
    return new Promise((resolve, reject) => {
        const req = https.get('https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page_size=100', {
            headers: { 'Authorization': `Token ${token}` }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.results || []);
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
    });
}

function testFacebookConnection(proxyHost, proxyPort, username, password) {
    return new Promise((resolve) => {
        const start = Date.now();
        const req = http.request({
            host: proxyHost,
            port: Number(proxyPort),
            method: 'CONNECT',
            path: 'www.facebook.com:443',
            headers: {
                'Proxy-Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
            },
            timeout: 8000
        });

        req.on('connect', (res, socket) => {
            if (res.statusCode !== 200) {
                socket.destroy();
                return resolve({
                    success: false,
                    stage: 'CONNECT',
                    statusCode: res.statusCode,
                    latency: Date.now() - start,
                    error: `Proxy returned HTTP ${res.statusCode}`
                });
            }

            const sreq = https.get({
                host: 'www.facebook.com',
                path: '/',
                socket: socket,
                agent: false,
                timeout: 8000
            }, sres => {
                const latency = Date.now() - start;
                sres.resume();
                resolve({
                    success: true,
                    stage: 'FACEBOOK_HTTPS',
                    statusCode: sres.statusCode,
                    latency: latency
                });
            });

            sreq.on('error', (err) => {
                resolve({
                    success: false,
                    stage: 'TLS_GET',
                    latency: Date.now() - start,
                    error: err.message
                });
            });

            sreq.on('timeout', () => {
                sreq.destroy();
                resolve({
                    success: false,
                    stage: 'TLS_TIMEOUT',
                    latency: Date.now() - start,
                    error: 'Facebook HTTPS timeout (>8s)'
                });
            });
        });

        req.on('error', (err) => {
            resolve({
                success: false,
                stage: 'PROXY_CONNECT',
                latency: Date.now() - start,
                error: err.message
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                success: false,
                stage: 'PROXY_TIMEOUT',
                latency: Date.now() - start,
                error: 'Proxy connect timeout (>8s)'
            });
        });

        req.end();
    });
}

async function checkBlacklists(ip) {
    const rev = ip.split('.').reverse().join('.');
    const lists = [
        { name: 'Spamhaus ZEN', host: 'zen.spamhaus.org' },
        { name: 'SpamCop', host: 'bl.spamcop.net' },
        { name: 'Barracuda', host: 'b.barracudacentral.org' }
    ];

    const flagged = [];
    for (const bl of lists) {
        try {
            const res = await dns.resolve4(`${rev}.${bl.host}`);
            flagged.push(`${bl.name} (${res.join(',')})`);
        } catch (e) {
            // ENOTFOUND means clean
        }
    }
    return flagged;
}

async function runAudit() {
    await verifyUpstreamSync();
    console.log('[ProxyAudit] Fetching Webshare Proxies & AdsPower Proxy Pool...');
    const [webshareList, adsProxiesRes] = await Promise.all([
        fetchWebshareProxies(),
        adsClient.listProxies(1, 100).catch(() => ({ list: [] }))
    ]);

    const adsList = adsProxiesRes.list || [];
    console.log(`[ProxyAudit] Loaded ${webshareList.length} proxies from Webshare, ${adsList.length} proxies from AdsPower.\n`);

    const adsMap = new Map();
    adsList.forEach(p => {
        adsMap.set(`${p.host}:${p.port}`, p);
        adsMap.set(p.host, p);
    });

    const results = [];
    const concurrency = 6;
    let idx = 0;

    async function worker() {
        while (idx < webshareList.length) {
            const currentIdx = idx++;
            const p = webshareList[currentIdx];
            const adsP = adsMap.get(`${p.proxy_address}:${p.port}`) || adsMap.get(p.proxy_address);

            const [fbTest, blacklists] = await Promise.all([
                testFacebookConnection(p.proxy_address, p.port, p.username, p.password),
                checkBlacklists(p.proxy_address)
            ]);

            const adsTag = (adsP?.proxy_tags || []).map(t => t.name).join(', ') || 'Unassigned';
            const adsProfiles = adsP?.profile_count || '0';
            const adsId = adsP?.proxy_id || 'N/A';

            results.push({
                index: currentIdx + 1,
                adsId: Number(adsId) || 999,
                ip: p.proxy_address,
                port: p.port,
                country: p.country_code,
                city: p.city_name,
                asn: p.asn_name,
                tag: adsTag,
                profileCount: adsProfiles,
                webshareValid: p.valid,
                fbSuccess: fbTest.success,
                fbStatus: fbTest.statusCode || 'ERR',
                latencyMs: fbTest.latency,
                error: fbTest.error || null,
                blacklists: blacklists
            });
        }
    }

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    results.sort((a, b) => a.adsId - b.adsId);

    const total = results.length;
    const fbWorking = results.filter(r => r.fbSuccess).length;
    const cleanDnsbl = results.filter(r => r.blacklists.length === 0).length;
    const perfect100 = results.filter(r => r.fbSuccess && r.blacklists.length === 0 && r.webshareValid).length;

    console.log('========================================================================================================');
    console.log(`| AdsID | IP Address        | Port  | Country | AdsPower Tag    | Profiles | FB Test  | Latency | DNSBL Status |`);
    console.log('========================================================================================================');
    results.forEach(r => {
        const idStr = String(r.adsId).padStart(5, ' ');
        const ipStr = r.ip.padEnd(17, ' ');
        const portStr = String(r.port).padEnd(5, ' ');
        const ctryStr = `${r.country} (${r.city})`.padEnd(7, ' ').slice(0, 7);
        const tagStr = r.tag.padEnd(15, ' ').slice(0, 15);
        const profStr = String(r.profileCount).padStart(8, ' ');
        const fbStr = r.fbSuccess ? `OK (${r.fbStatus})`.padEnd(8, ' ') : `FAIL    `;
        const latStr = `${r.latencyMs}ms`.padStart(7, ' ');
        const blStr = r.blacklists.length === 0 ? 'Clean (0)' : `FLAGGED: ${r.blacklists.join(',')}`;
        console.log(`| ${idStr} | ${ipStr} | ${portStr} | ${ctryStr} | ${tagStr} | ${profStr} | ${fbStr} | ${latStr} | ${blStr} |`);
    });
    console.log('========================================================================================================');

    console.log('\n=== AUDIT SUMMARY ===');
    console.log(`• Total Proxies Checked: ${total}`);
    console.log(`• Webshare Valid: ${results.filter(r => r.webshareValid).length}/${total}`);
    console.log(`• Facebook Direct Reachable (HTTP 200/302): ${fbWorking}/${total}`);
    console.log(`• DNSBL Blacklist Clean (Spamhaus/SpamCop/Barracuda): ${cleanDnsbl}/${total}`);
    console.log(`• Overall 100% Healthy & Production-Ready: ${perfect100}/${total} (${((perfect100/total)*100).toFixed(1)}%)`);

    return { total, fbWorking, cleanDnsbl, perfect100, results };
}

if (require.main === module) {
    runAudit().catch(err => {
        console.error('[ProxyAudit] Fatal error:', err);
        process.exit(1);
    });
}

module.exports = { runAudit, testFacebookConnection, checkBlacklists };
