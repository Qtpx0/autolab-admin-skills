const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const AUTOLAB_BACKGROUND_FLAGS = Object.freeze([
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
]);

function defaultCredentialsPath(env = process.env) {
    const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'AutoLab', 'AdminSkills', 'credentials.json');
}

function loadCredentials({ credentialsPath = defaultCredentialsPath(), env = process.env } = {}) {
    let stored = {};
    if (fs.existsSync(credentialsPath)) {
        stored = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    }
    return {
        adsPowerApiKey: env.ADS_API_KEY || stored.adsPowerApiKey || '',
        webshareApiToken: env.WEBSHARE_API_TOKEN || stored.webshareApiToken || ''
    };
}

function requireCredential(name, options) {
    const credentials = loadCredentials(options);
    const value = credentials[name];
    if (!value) {
        throw new Error(`Missing ${name}. Configure ${defaultCredentialsPath(options?.env)} or its environment variable.`);
    }
    return value;
}

function extractLegacyCredentials({ adsSource = '', webshareSource = '' } = {}) {
    const adsMatch = adsSource.match(/const\s+ADSPOWER_KEY\s*=\s*['"]([^'"]+)['"]/);
    const webshareMatch = webshareSource.match(/const\s+WEBSHARE_TOKEN\s*=\s*['"]([^'"]+)['"]/);
    return {
        adsPowerApiKey: adsMatch?.[1] || '',
        webshareApiToken: webshareMatch?.[1] || ''
    };
}

function saveCredentials(credentials, credentialsPath = defaultCredentialsPath()) {
    fs.mkdirSync(path.dirname(credentialsPath), { recursive: true });
    const payload = {
        migrationVersion: 1,
        adsPowerApiKey: credentials.adsPowerApiKey || '',
        webshareApiToken: credentials.webshareApiToken || ''
    };
    fs.writeFileSync(credentialsPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

function mergeLaunchArgs(existing = []) {
    const merged = Array.isArray(existing) ? [...existing] : [];
    for (const flag of AUTOLAB_BACKGROUND_FLAGS) {
        if (!merged.includes(flag)) merged.push(flag);
    }
    return merged;
}

function hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function classifyManagedFile({ currentHash, previousHash, incomingHash }) {
    if (!currentHash) return 'install';
    if (currentHash === incomingHash) return 'current';
    if (previousHash && currentHash === previousHash) return 'update';
    return 'conflict';
}

function defaultAdsPowerRuntimePath(env = process.env) {
    const appData = env.APPDATA || (process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : path.join(os.homedir(), 'AppData', 'Roaming'));
    return path.join(appData, 'adspower_global', 'cwd_global', 'source', 'local_api');
}

function getLiveAdsPowerUrl(options = {}) {
    const filePath = options.runtimePath || defaultAdsPowerRuntimePath(options.env || process.env);
    if (fs.existsSync(filePath)) {
        try {
            const content = fs.readFileSync(filePath, 'utf8').trim();
            if (content.startsWith('http')) return content;
        } catch (e) {}
    }
    return null;
}

function getLiveAdsPowerPort(options = {}) {
    const url = getLiveAdsPowerUrl(options);
    if (url) {
        const match = url.match(/:(\d+)/);
        if (match) return parseInt(match[1], 10);
    }
    return null;
}

const https = require('https');
let lastSyncCheck = 0;
const SYNC_CACHE_MS = 10 * 60 * 1000; // 10 minutes cache

function getLocalPackageVersion() {
    try {
        const paths = [
            path.resolve(__dirname, '..', '..', '..', 'admin-skill-kit', 'manifest.json'),
            path.resolve(__dirname, '..', '..', '..', 'manifest.json'),
            path.resolve(__dirname, '..', '..', 'manifest.json')
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) {
                return JSON.parse(fs.readFileSync(p, 'utf8')).version || '1.0.0';
            }
        }
    } catch (e) {}
    return '1.4.0';
}

function fetchUpstreamManifest() {
    return new Promise((resolve) => {
        const req = https.get('https://raw.githubusercontent.com/Qtpx0/autolab-admin-skills/main/manifest.json', {
            timeout: 2500
        }, res => {
            if (res.statusCode !== 200) return resolve(null);
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve(JSON.parse(d)); } catch (e) { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

function compareSemVer(v1, v2) {
    const p1 = (v1 || '0').split('.').map(n => parseInt(n, 10) || 0);
    const p2 = (v2 || '0').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
}

async function verifyUpstreamSync() {
    const now = Date.now();
    if (now - lastSyncCheck < SYNC_CACHE_MS) return null;
    lastSyncCheck = now;

    try {
        const localVersion = getLocalPackageVersion();
        const remote = await fetchUpstreamManifest();
        if (!remote || !remote.version) return null;

        if (compareSemVer(remote.version, localVersion) > 0) {
            console.log('\n================================================================');
            console.log(`🔔 [AutoLab Auto-Sync] ตรวจพบเวอร์ชันใหม่บน GitHub (v${remote.version})!`);
            console.log(`📌 ปัจจุบันเครื่องคุณใช้งาน v${localVersion}`);
            console.log(`💡 คำสั่งอัปเดต: node scripts/update-admin-skills.js --apply --project .`);
            console.log('================================================================\n');
            return { updateAvailable: true, remoteVersion: remote.version, localVersion };
        }
    } catch (e) {}
    return null;
}

module.exports = {
    AUTOLAB_BACKGROUND_FLAGS,
    defaultCredentialsPath,
    defaultAdsPowerRuntimePath,
    getLiveAdsPowerUrl,
    getLiveAdsPowerPort,
    loadCredentials,
    requireCredential,
    extractLegacyCredentials,
    saveCredentials,
    mergeLaunchArgs,
    hashContent,
    classifyManagedFile,
    verifyUpstreamSync
};

