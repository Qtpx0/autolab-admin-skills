const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    AUTOLAB_BACKGROUND_FLAGS,
    extractLegacyCredentials,
    loadCredentials,
    mergeLaunchArgs,
    saveCredentials,
    classifyManagedFile,
    getLiveAdsPowerUrl,
    getLiveAdsPowerPort
} = require('./admin-kit-core');


const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'autolab-admin-kit-'));
const credentialsPath = path.join(tempRoot, 'credentials.json');
fs.writeFileSync(credentialsPath, JSON.stringify({
    adsPowerApiKey: 'file-ads-key',
    webshareApiToken: 'file-webshare-token'
}));

assert.deepStrictEqual(AUTOLAB_BACKGROUND_FLAGS, [
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
]);

assert.deepStrictEqual(
    mergeLaunchArgs(['--window-size=1280,720', AUTOLAB_BACKGROUND_FLAGS[0]]),
    ['--window-size=1280,720', ...AUTOLAB_BACKGROUND_FLAGS]
);

assert.deepStrictEqual(loadCredentials({ credentialsPath, env: {} }), {
    adsPowerApiKey: 'file-ads-key',
    webshareApiToken: 'file-webshare-token'
});

assert.deepStrictEqual(loadCredentials({
    credentialsPath,
    env: { ADS_API_KEY: 'env-ads-key', WEBSHARE_API_TOKEN: 'env-webshare-token' }
}), {
    adsPowerApiKey: 'env-ads-key',
    webshareApiToken: 'env-webshare-token'
});

assert.deepStrictEqual(extractLegacyCredentials({
    adsSource: "const ADSPOWER_KEY = 'legacy-ads';",
    webshareSource: "const WEBSHARE_TOKEN = 'legacy-webshare';"
}), {
    adsPowerApiKey: 'legacy-ads',
    webshareApiToken: 'legacy-webshare'
});

const migratedPath = path.join(tempRoot, 'nested', 'credentials.json');
saveCredentials({ adsPowerApiKey: 'saved-ads', webshareApiToken: 'saved-webshare' }, migratedPath);
assert.deepStrictEqual(JSON.parse(fs.readFileSync(migratedPath, 'utf8')), {
    migrationVersion: 1,
    adsPowerApiKey: 'saved-ads',
    webshareApiToken: 'saved-webshare'
});

assert.strictEqual(classifyManagedFile({ currentHash: null, previousHash: null, incomingHash: 'new' }), 'install');
assert.strictEqual(classifyManagedFile({ currentHash: 'old', previousHash: 'old', incomingHash: 'new' }), 'update');
assert.strictEqual(classifyManagedFile({ currentHash: 'custom', previousHash: 'old', incomingHash: 'new' }), 'conflict');
assert.strictEqual(classifyManagedFile({ currentHash: 'new', previousHash: 'old', incomingHash: 'new' }), 'current');

const mockRuntimeDir = path.join(tempRoot, 'adspower_global', 'cwd_global', 'source');
fs.mkdirSync(mockRuntimeDir, { recursive: true });
const mockRuntimeFile = path.join(mockRuntimeDir, 'local_api');
fs.writeFileSync(mockRuntimeFile, 'http://local.adspower.com:12345/\n');

assert.strictEqual(getLiveAdsPowerUrl({ runtimePath: mockRuntimeFile }), 'http://local.adspower.com:12345/');
assert.strictEqual(getLiveAdsPowerPort({ runtimePath: mockRuntimeFile }), 12345);
assert.strictEqual(getLiveAdsPowerUrl({ runtimePath: path.join(tempRoot, 'non_existent') }), null);
assert.strictEqual(getLiveAdsPowerPort({ runtimePath: path.join(tempRoot, 'non_existent') }), null);

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log('PASS admin skill kit contract');

