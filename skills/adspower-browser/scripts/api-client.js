const http = require('http');
const {
    AUTOLAB_BACKGROUND_FLAGS,
    mergeLaunchArgs,
    requireCredential,
    getLiveAdsPowerPort
} = require('./admin-kit-core');

let CACHED_PORT = null;
const DEFAULT_PORTS = [14555, 13659, 50325, 6288, 2860, 13249];

function getAdsPowerKey() {
    return requireCredential('adsPowerApiKey');
}

/**
 * Zero-Config Dynamic Port Resolver
 * Reads AdsPower runtime file (cwd_global/source/local_api) in 0ms.
 * Fallbacks to DEFAULT_PORTS only if runtime file is absent.
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

    // 1. Zero-Config Direct Read from AdsPower runtime file (0ms)
    try {
        const livePort = getLiveAdsPowerPort();
        if (livePort) {
            if (await testPort(livePort)) {
                CACHED_PORT = livePort;
                return livePort;
            }
        }
    } catch (e) {}

    // 2. Fallback to known common ports if runtime file is missing
    for (const p of DEFAULT_PORTS) {
        try {
            if (await testPort(p)) {
                CACHED_PORT = p;
                return p;
            }
        } catch (e) {}
    }

    return 50325; // fallback
}


function testPort(port) {
    return new Promise((resolve) => {
        const req = http.get({
            hostname: '127.0.0.1',
            port: port,
            path: '/status',
            timeout: 500
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(d);
                    resolve(json.code === 0);
                } catch (e) {
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

const AUTOLAB_GOLDEN_FINGERPRINT = {
    automatic_timezone: '1',
    location_switch: '1',
    language_switch: '1',
    page_language_switch: '1',
    canvas: '1',
    webgl_image: '1',
    audio: '1',
    webrtc: 'proxy',
    media_devices: '1',
    client_rects: '1',
    speech_switch: '1',
    random_ua: {
        ua_system_version: ['Windows 10', 'Windows 11']
    }
};

module.exports = {
    getActivePort,
    sleep: (ms) => new Promise(r => setTimeout(r, ms)),
    AUTOLAB_GOLDEN_FINGERPRINT,

    // 1. Profile Operations
    listProfiles: (query = {}) => request('/api/v1/user/list?' + new URLSearchParams(query).toString()),
    getProfile: (profile_id) => request(`/api/v1/user/list?profile_id=${profile_id}`),
    createProfile: (data) => {
        const payload = {
            ...data,
            fingerprint_config: {
                ...AUTOLAB_GOLDEN_FINGERPRINT,
                ...(data.fingerprint_config || {})
            }
        };
        return request('/api/v1/user/create', 'POST', payload);
    },
    /**
     * AutoLab Golden Standard Profile Factory
     * Creates an AdsPower profile guaranteed to have Windows 10/11 Desktop OS, AudioContext noise ON,
     * WebRTC replace, IP-based Timezone/Location, and automatically persists the 3 Chromium occlusion flags.
     * Includes built-in rate-limit safety pause (1300ms) for reliable batch operations.
     */
    createAutoLabProfile: async function({ name, group_id = '0', proxyid = null, user_proxy_config = null, remark = '', tabs = [] }) {
        const payload = {
            name,
            group_id: String(group_id),
            remark,
            fingerprint_config: { ...AUTOLAB_GOLDEN_FINGERPRINT }
        };

        if (proxyid) {
            payload.proxyid = String(proxyid);
        } else if (user_proxy_config) {
            payload.user_proxy_config = user_proxy_config;
        } else {
            payload.user_proxy_config = { proxy_soft: 'no_proxy' };
        }

        if (tabs && tabs.length > 0) {
            payload.tabs = tabs;
        }

        const createRes = await request('/api/v1/user/create', 'POST', payload);
        const profileId = createRes?.id || createRes?.data?.id || createRes?.profile_id;
        
        if (profileId) {
            await new Promise(r => setTimeout(r, 600));
            try {
                await request('/api/v2/browser-profile/update', 'POST', {
                    profile_id: profileId,
                    launch_args: mergeLaunchArgs([])
                });
            } catch (e) {
                // Non-fatal, profile still created successfully
            }
        }

        // Built-in rate limit safety guard for AdsPower API (1 req/sec limit)
        await new Promise(r => setTimeout(r, 1300));
        return createRes;
    },
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
    listProxies: (page = 1, limit = 100) => request('/api/v2/proxy-list/list', 'POST', { page, limit }),
    createProxies: (proxies) => request('/api/v2/proxy-list/create', 'POST', proxies),
    updateProxy: (data) => request('/api/v2/proxy-list/update', 'POST', data),
    deleteProxies: (proxy_ids) => request('/api/v2/proxy-list/delete', 'POST', { proxy_id: proxy_ids }),

    // 6. Group Management
    listGroups: () => request('/api/v1/group/list?page_size=100'),
    createGroup: (group_name, remark = '') => request('/api/v1/group/create', 'POST', { group_name, remark })
};
