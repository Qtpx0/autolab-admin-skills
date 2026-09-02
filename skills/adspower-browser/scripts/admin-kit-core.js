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

module.exports = {
    AUTOLAB_BACKGROUND_FLAGS,
    defaultCredentialsPath,
    loadCredentials,
    requireCredential,
    extractLegacyCredentials,
    saveCredentials,
    mergeLaunchArgs,
    hashContent,
    classifyManagedFile
};
