const http = require('http');
const { execSync } = require('child_process');
const { AUTOLAB_BACKGROUND_FLAGS, mergeLaunchArgs, requireCredential } = require('./admin-kit-core');

let CACHED_PORT = null;
const DEFAULT_PORTS = [50325, 6288, 2860, 13249];

function getAdsPowerKey() {
    return requireCredential('adsPowerApiKey');
}

/**
 * High-Speed Dynamic Port Resolver
 * Auto-detects the active AdsPower Local API port in milliseconds.
 */
async function getActivePort() {
    if (CACHED_PORT) {
        // Quick verification of cached port
        try {
            const alive = await testPort(CACHED_PORT);
            if (alive) return CACHED_PORT;
        } catch (e) {
            CACHED_PORT = null;
        }
    }

    // 1. Try known common ports first
    for (const p of DEFAULT_PORTS) {
        try {
            if (await testPort(p)) {
                CACHED_PORT = p;
                return p;
            }
        } catch (e) {}
    }

    // 2. Scan listening ports on system
    try {
        const netstat = execSync('netstat -ano').toString();
        const ports = [...new Set(netstat.split('\n')
            .filter(l => l.includes('LISTENING') && l.includes('127.0.0.1'))
            .map(l => parseInt(l.trim().split(/\s+/)[1]?.split(':')[1]))
            .filter(p => p && p > 1000 && p !== 5027))];

        for (const p of ports) {
            try {
                if (await testPort(p)) {
                    CACHED_PORT = p;
                    return p;
                }
            } catch (e) {}
        }
    } catch (e) {}

    return 50325; // fallback
}

function testPort(port) {
    const adsPowerKey = getAdsPowerKey();
    return new Promise((resolve) => {
        const req = http.get({
            hostname: '127.0.0.1',
            port: port,
            path: '/api/v1/user/list?page_size=1',
            headers: { 'Authorization': `Bearer ${adsPowerKey}`, 'api-key': adsPowerKey },
            timeout: 400
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                if (d.includes('\"msg\":\"Success\"') || (d.includes('\"msg\"') && d.includes('\"code\"') && !d.includes('\"message\":\"Not Found\"'))) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
    });
}

/**
 * Direct High-Speed HTTP Client for AdsPower Local API
 * Executes in milliseconds with dual authentication headers.
 */
async function request(path, method = 'GET', body = null) {
    const activePort = await getActivePort();
    const adsPowerKey = getAdsPowerKey();
    return new Promise((resolve, reject) => {
        const postData = body ? JSON.stringify(body) : '';
        const req = http.request({
            hostname: '127.0.0.1',
            port: activePort,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adsPowerKey}`,
                'api-key': adsPowerKey,
                'x-mcp-client': 'mcp',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 10000
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.code === 0 || parsed.data) {
                        resolve(parsed.data || parsed);
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`AdsPower Local API timeout on port ${activePort}`));
        });

        if (postData) req.write(postData);
        req.end();
    });
}

module.exports = {
    getActivePort,
    sleep: (ms) => new Promise(r => setTimeout(r, ms)),

    // 1. Profile Operations
    listProfiles: (query = {}) => request('/api/v1/user/list?' + new URLSearchParams(query).toString()),
    getProfile: (profile_id) => request(`/api/v1/user/list?profile_id=${profile_id}`),
    createProfile: (data) => request('/api/v1/user/create', 'POST', data),
    updateProfile: (data) => request('/api/v1/user/update', 'POST', data),
    persistAutoPostLaunchArgs: (profile_id, existingArgs = []) => request(
        '/api/v2/browser-profile/update',
        'POST',
        { profile_id, launch_args: mergeLaunchArgs(existingArgs) }
    ),
    autoPostLaunchArgs: [...AUTOLAB_BACKGROUND_FLAGS],
    deleteProfiles: (profile_ids) => request('/api/v1/user/delete', 'POST', { profile_ids }),
    
    // 2. Saved Proxy Pool Binding (Strict Agency Standard)
    bindProxyPool: (userId, proxyId) => request('/api/v1/user/update', 'POST', {
        user_id: userId,
        proxyid: String(proxyId)
    }),

    // 3. Browser Controls
    openBrowser: (profile_id, launchArgs = []) => {
        const query = new URLSearchParams({ profile_id });
        if (launchArgs && launchArgs.length > 0) {
            query.append('launch_args', JSON.stringify(launchArgs));
        }
        return request(`/api/v1/browser/start?${query.toString()}`);
    },
    closeBrowser: (profile_id) => request(`/api/v1/browser/stop?profile_id=${profile_id}`),
    
    // 4. Clean-Slate & Fingerprint
    deleteCache: (profile_ids, types = ['local_storage', 'indexeddb', 'cookie', 'history', 'image_file']) => 
        request('/api/v1/user/delete-cache-v2', 'POST', { profile_id: profile_ids, type: types }),
    newFingerprint: (profile_id) => request('/api/v1/user/new-fingerprint', 'POST', { profile_id }),

    // 5. Proxy Pool Management
    listProxies: (page = 1, limit = 100) => request(`/api/v1/proxy/list?page=${page}&limit=${limit}`),
    createProxies: (proxies) => request('/api/v1/proxy/create', 'POST', proxies),
    updateProxy: (data) => request('/api/v1/proxy/update', 'POST', data),
    deleteProxies: (proxy_ids) => request('/api/v1/proxy/delete', 'POST', { proxy_ids }),

    // 6. Group Management
    listGroups: () => request('/api/v1/group/list?page_size=100'),
    createGroup: (group_name, remark = '') => request('/api/v1/group/create', 'POST', { group_name, remark })
};
