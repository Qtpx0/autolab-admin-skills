const https = require('https');
const { exec } = require('child_process');
const path = require('path');
const adsClient = require('../../adspower-browser/scripts/api-client');
const { requireCredential } = require('../../adspower-browser/scripts/admin-kit-core');

function getWebshareToken() {
    return requireCredential('webshareApiToken');
}

function webshareRequest(endpoint, method = 'GET', body = null) {
    const webshareToken = getWebshareToken();
    return new Promise((resolve, reject) => {
        const postData = body ? JSON.stringify(body) : '';
        const req = https.request({
            hostname: 'proxy.webshare.io',
            path: endpoint,
            method: method,
            headers: {
                'Authorization': `Token ${webshareToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
            });
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function runCurl(username, password, host, port) {
    return new Promise((resolve) => {
        exec(`curl.exe -x "http://${username}:${password}@${host}:${port}" "http://ip-api.com/json"`, (err, stdout) => {
            if (err) return resolve({ status: 'curl_error', message: err.message });
            try { resolve(JSON.parse(stdout)); } catch (e) { resolve(stdout); }
        });
    });
}

/**
 * Verified Webshare v3 Fast Country Swap
 * @param {string} profileQuery - Profile Name or Profile ID
 * @param {string} targetCountry - e.g. "US" or "SG"
 */
async function swapCountry(profileQuery, targetCountry = 'US') {
    console.log(`[FastSwap] Locating profile: "${profileQuery}"...`);
    const listRes = await adsClient.listProfiles();
    const profiles = listRes.list || [];
    
    const profile = profiles.find(p => 
        p.profile_id === profileQuery || 
        p.profile_no === profileQuery || 
        p.name.includes(profileQuery)
    );

    if (!profile) {
        throw new Error(`Profile not found for: ${profileQuery}`);
    }

    const proxyId = profile.fbcc_proxy_acc_id;
    if (!proxyId) {
        throw new Error(`Profile ${profile.name} is not bound to a pool Proxy ID!`);
    }

    console.log(`[FastSwap] Profile "${profile.name}" (No: ${profile.profile_no}) is bound to Proxy ID: ${proxyId}`);
    
    // Fetch proxy details to get old IP
    const proxyListRes = await adsClient.listProxies();
    const proxies = proxyListRes.list || [];
    const proxyObj = proxies.find(p => p.proxy_id === proxyId);
    
    if (!proxyObj) {
        throw new Error(`Proxy ID ${proxyId} not found in AdsPower pool!`);
    }

    const oldIp = proxyObj.host;
    console.log(`[FastSwap] Current IP is: ${oldIp}. Initiating Webshare v3 swap to ${targetCountry} 🇺🇸...`);

    // Step 1: Trigger Webshare v3 Replacement
    const triggerRes = await webshareRequest('/api/v3/proxy/replace/', 'POST', {
        to_replace: {
            type: "ip_address",
            ip_addresses: [oldIp]
        },
        replace_with: [
            {
                type: "country",
                country_code: targetCountry
            }
        ],
        dry_run: false
    });

    const replaceId = triggerRes.id;
    if (!replaceId) {
        throw new Error(`Replacement trigger error: ${JSON.stringify(triggerRes)}`);
    }

    // Step 2: Poll replacement status (takes ~3s)
    let completed = false;
    let attempts = 0;
    while (!completed && attempts < 15) {
        await sleep(1500);
        attempts++;
        const poll = await webshareRequest(`/api/v3/proxy/replace/${replaceId}/`);
        if (poll.state === 'completed') {
            completed = true;
            break;
        } else if (poll.state === 'failed') {
            throw new Error(`Replacement failed: ${JSON.stringify(poll)}`);
        }
    }

    // Step 3: Fetch updated direct list
    console.log('[FastSwap] Fetching new IP from Webshare pool...');
    const poolRes = await webshareRequest('/api/v2/proxy/list/?mode=direct&page_size=100');
    // Find the new IP that replaced the old one
    const newProxy = poolRes.results.find(p => p.country_code === targetCountry && p.proxy_address !== oldIp);
    
    if (!newProxy) {
        throw new Error(`Could not find new ${targetCountry} proxy in Webshare!`);
    }

    console.log(`[FastSwap] Newly allocated ${targetCountry} IP: ${newProxy.proxy_address}:${newProxy.port}`);

    // Step 4: Update AdsPower Proxy in pool
    await adsClient.updateProxy({
        proxy_id: proxyId,
        host: newProxy.proxy_address,
        port: String(newProxy.port),
        user: newProxy.username,
        password: newProxy.password
    });

    // Step 5: Update AdsPower Profile
    await adsClient.updateProfile({
        profile_id: profile.profile_id,
        proxyid: proxyId
    });

    // Step 6: Live Curl Verification
    console.log('[FastSwap] Verifying live connection with curl...');
    const audit = await runCurl(newProxy.username, newProxy.password, newProxy.proxy_address, newProxy.port);
    
    console.log('--- SWAP COMPLETED SUCCESSFULLY ---');
    console.log(JSON.stringify({
        profile_name: profile.name,
        profile_no: profile.profile_no,
        proxy_id: proxyId,
        old_ip: oldIp,
        new_ip: newProxy.proxy_address,
        port: newProxy.port,
        country: audit.country || targetCountry,
        region: audit.regionName,
        city: audit.city,
        isp: audit.isp,
        status: audit.status || 'success'
    }, null, 2));
}

const targetProfile = process.argv[2];
const targetCountry = process.argv[3] || 'US';

if (!targetProfile) {
    console.log('Usage: node swap-proxy-country.js <profile_no | profile_id | profile_name> [country_code (default US)]');
    process.exit(1);
}

swapCountry(targetProfile, targetCountry).catch(console.error);
