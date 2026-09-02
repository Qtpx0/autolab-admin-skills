const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function parseArgs(argv) {
    const result = { mode: 'plan', project: '' };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--project') result.project = argv[++i] || '';
        else if (argv[i] === '--apply') result.mode = 'apply';
        else if (argv[i] === '--plan') result.mode = 'plan';
    }
    if (!result.project) throw new Error('--project <PROJECT_PATH> is required');
    return result;
}

function walkFiles(root, prefix = '') {
    if (!fs.existsSync(root)) return [];
    const files = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const rel = path.join(prefix, entry.name);
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) files.push(...walkFiles(full, rel));
        else files.push(rel);
    }
    return files;
}

function hashFile(file) {
    return fs.existsSync(file)
        ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
        : null;
}

function isPreserved(relativePath, preserve) {
    const normalized = relativePath.replaceAll('\\', '/');
    return preserve.some(item => normalized === item || normalized.startsWith(item));
}

function migrateCredentials(sourceRoot, targetSkillsRoot, credentialsPath) {
    if (fs.existsSync(credentialsPath)) return 'existing';
    const core = require(path.join(sourceRoot, 'skills', 'adspower-browser', 'scripts', 'admin-kit-core.js'));
    const oldAds = path.join(targetSkillsRoot, 'adspower-browser', 'scripts', 'api-client.js');
    const oldWebshare = path.join(targetSkillsRoot, 'webshare-proxy', 'scripts', 'swap-proxy-country.js');
    const credentials = core.extractLegacyCredentials({
        adsSource: fs.existsSync(oldAds) ? fs.readFileSync(oldAds, 'utf8') : '',
        webshareSource: fs.existsSync(oldWebshare) ? fs.readFileSync(oldWebshare, 'utf8') : ''
    });
    if (!credentials.adsPowerApiKey || !credentials.webshareApiToken) return 'missing';
    core.saveCredentials(credentials, credentialsPath);
    return 'migrated';
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const sourceRoot = path.resolve(__dirname, '..');
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'manifest.json'), 'utf8'));
    const targetSkillsRoot = path.join(path.resolve(options.project), '.agents', 'skills');
    if (!fs.existsSync(path.dirname(targetSkillsRoot))) {
        throw new Error(`Project .agents directory not found: ${path.dirname(targetSkillsRoot)}`);
    }

    const changes = [];
    for (const skill of manifest.skills) {
        const sourceSkill = path.join(sourceRoot, 'skills', skill);
        if (!fs.existsSync(sourceSkill)) throw new Error(`Bundle skill missing: ${skill}`);
        for (const rel of walkFiles(sourceSkill)) {
            if (isPreserved(rel, manifest.preserve)) continue;
            const source = path.join(sourceSkill, rel);
            const target = path.join(targetSkillsRoot, skill, rel);
            if (hashFile(source) !== hashFile(target)) changes.push({ skill, rel, source, target });
        }
    }

    console.log(JSON.stringify({ package: manifest.package, version: manifest.version, mode: options.mode,
        changedManagedFiles: changes.map(item => `${item.skill}/${item.rel}`) }, null, 2));
    if (options.mode === 'plan' || changes.length === 0) return;

    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const adminRoot = path.join(appData, 'AutoLab', 'AdminSkills');
    const credentialsPath = path.join(adminRoot, 'credentials.json');
    const credentialState = migrateCredentials(sourceRoot, targetSkillsRoot, credentialsPath);
    if (credentialState === 'missing') {
        throw new Error(`Credentials missing. Configure ${credentialsPath} before applying the update.`);
    }

    const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const backupRoot = path.join(adminRoot, 'backups', stamp);
    for (const skill of manifest.skills) {
        const targetSkill = path.join(targetSkillsRoot, skill);
        if (fs.existsSync(targetSkill)) {
            fs.cpSync(targetSkill, path.join(backupRoot, skill), { recursive: true });
        }
    }
    for (const change of changes) {
        fs.mkdirSync(path.dirname(change.target), { recursive: true });
        fs.copyFileSync(change.source, change.target);
    }
    fs.mkdirSync(adminRoot, { recursive: true });
    fs.writeFileSync(path.join(adminRoot, 'state.json'), JSON.stringify({
        package: manifest.package,
        version: manifest.version,
        updatedAt: new Date().toISOString(),
        backupRoot
    }, null, 2));
    console.log(JSON.stringify({ applied: changes.length, credentialState, backupRoot }, null, 2));
}

if (require.main === module) {
    try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { parseArgs, walkFiles, hashFile, isPreserved, migrateCredentials };
