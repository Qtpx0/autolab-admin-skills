/**
 * AutoLab Webshare -> AdsPower In-Place Proxy Synchronizer & Swapper (v2 — Diff-Based, Zero-Reshuffle)
 *
 * SAFETY MODEL (Zero-Downtime standard):
 *   - Every command is PLAN-ONLY by default. Nothing is written until you add --apply.
 *   - Diff-based sync: rows whose IP still exists in Webshare are NEVER touched.
 *     Only rows whose IP disappeared ("orphans") receive a new, unused IP.
 *     => IPs never reshuffle between teams/households.
 *   - Rows not owned by this Webshare account (different proxy username) are never touched.
 *   - Before any write, a snapshot of the affected AdsPower rows is saved outside Git:
 *       %APPDATA%\AutoLab\AdminSkills\backups\proxy-sync\<timestamp>.json
 *     Restore with --rollback <file> [--apply].
 *   - After every write, rows are read back and verified; mismatches are retried once with a slower pace.
 *   - Live-session guard uses /api/v1/browser/local-active. It can ONLY see THIS machine.
 *     Other staff machines are invisible: treat staff as live unless the operator confirms otherwise.
 *     If the guard cannot determine state, it fails CLOSED (abort) unless --force.
 *
 * COMMANDS:
 *   --sync-all [--apply] [--force] [--delay <ms>]
 *   --proxy-id <ID> [--apply]          Replace one row's IP via Webshare v3 replace (consumes 1 replacement quota)
 *   --old-ip <IP>   [--apply]
 *   --rollback <backup.json> [--apply] [--force]
 */

const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RETRY_DELAY_MS = 1500;
const DEFAULT_DELAY_MS = 400;
const REPLACE_POLL_INTERVAL_MS = 2000;
const REPLACE_POLL_MAX = 60; // 120s
const PAGE_SIZE = 100;

// Lazily loaded so the pure planner can be unit-tested without credentials/AdsPower.
let _ads = null;
function ads() {
    if (!_ads) _ads = require('../../adspower-browser/scripts/api-client');
    return _ads;
}
function getWebshareToken() {
    return require('../../adspower-browser/scripts/admin-kit-core').requireCredential('webshareApiToken');
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

function wsKey(p) {
    return `${p.proxy_address}:${p.port}`;
}
function adsKey(row) {
    return `${row.host}:${row.port}`;
}
function rowTags(row) {
    return (row.proxy_tags || []).map(t => t.name).join(', ') || '-';
}

/** AdsPower Local API resolves error payloads instead of rejecting. Detect them explicitly. */
function isAdsError(res) {
    return !!res && typeof res === 'object' && typeof res.code === 'number' && res.code !== 0;
}

/**
 * Deterministic diff plan. Never reassigns an IP that is still alive.
 * @returns {{keep, credentialRefresh, assignments, unresolved, spares, unmanaged, duplicates}}
 */
function planDiffSync(adsRows, wsProxies) {
    const wsByKey = new Map();
    for (const p of wsProxies) wsByKey.set(wsKey(p), p);
    const managedUsers = new Set(wsProxies.map(p => p.username));

    const rows = [...adsRows].sort((a, b) => Number(a.proxy_id) - Number(b.proxy_id));
    const keep = [];
    const credentialRefresh = [];
    const orphans = [];
    const unmanaged = [];
    const duplicates = [];
    const usedKeys = new Set();

    for (const row of rows) {
        if (!managedUsers.has(row.user)) {
            unmanaged.push(row);
            continue;
        }
        const key = adsKey(row);
        const ws = wsByKey.get(key);
        if (!ws) {
            orphans.push(row);
            continue;
        }
        if (usedKeys.has(key)) {
            duplicates.push(row); // reported only; never auto-modified
            continue;
        }
        usedKeys.add(key);
        if (ws.password !== row.password) credentialRefresh.push({ row, ws });
        else keep.push(row);
    }

    const available = wsProxies
        .filter(p => !usedKeys.has(wsKey(p)))
        .sort((a, b) => {
            if (a.valid !== b.valid) return a.valid === false ? 1 : -1; // valid first
            const t = new Date(a.created_at || 0) - new Date(b.created_at || 0);
            if (t !== 0) return t;
            return String(a.id || wsKey(a)).localeCompare(String(b.id || wsKey(b)));
        });

    const assignments = [];
    const unresolved = [];
    orphans.forEach((row, i) => {
        if (i < available.length) assignments.push({ row, ws: available[i] });
        else unresolved.push(row);
    });
    const spares = available.slice(orphans.length);

    return { keep, credentialRefresh, assignments, unresolved, spares, unmanaged, duplicates };
}

/** Compute rows that differ from a backup snapshot. */
function planRollback(currentRows, backupRows) {
    const byId = new Map(currentRows.map(r => [String(r.proxy_id), r]));
    const changes = [];
    const missing = [];
    for (const b of backupRows) {
        const cur = byId.get(String(b.proxy_id));
        if (!cur) { missing.push(b); continue; }
        if (cur.host !== b.host || String(cur.port) !== String(b.port) || cur.user !== b.user || cur.password !== b.password) {
            changes.push({ row: cur, target: b });
        }
    }
    return { changes, missing };
}

// ---------------------------------------------------------------------------
// I/O: Webshare + AdsPower
// ---------------------------------------------------------------------------

function webshareRequest(endpoint, method = 'GET', body = null) {
    const token = getWebshareToken();
    return new Promise((resolve, reject) => {
        const postData = body ? JSON.stringify(body) : '';
        const req = https.request({
            hostname: 'proxy.webshare.io',
            path: endpoint,
            method,
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 20000
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
                if (res.statusCode >= 400) {
                    return reject(new Error(`Webshare ${method} ${endpoint} -> HTTP ${res.statusCode}: ${typeof parsed === 'string' ? parsed.slice(0, 200) : JSON.stringify(parsed).slice(0, 200)}`));
                }
                resolve(parsed);
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error(`Webshare ${endpoint} timeout`)); });
        if (postData) req.write(postData);
        req.end();
    });
}

async function fetchAllWebshare() {
    const all = [];
    let page = 1;
    for (;;) {
        const res = await webshareRequest(`/api/v2/proxy/list/?mode=direct&page=${page}&page_size=${PAGE_SIZE}`);
        if (!res || !Array.isArray(res.results)) throw new Error('Unexpected Webshare list response.');
        all.push(...res.results);
        if (!res.next) break;
        page++;
    }
    if (all.length === 0) throw new Error('Webshare returned 0 proxies — refusing to continue.');
    return all;
}

async function fetchAllAds() {
    const all = [];
    let page = 1;
    for (;;) {
        const res = await ads().listProxies(page, PAGE_SIZE);
        if (isAdsError(res) || !Array.isArray(res && res.list)) {
            throw new Error(`AdsPower proxy list failed: ${JSON.stringify(res).slice(0, 200)}`);
        }
        all.push(...res.list);
        const total = Number(res.total || 0);
        if (res.list.length < PAGE_SIZE || all.length >= total) break;
        page++;
    }
    return all;
}

async function adsUpdateRow(proxyId, host, port, user, password) {
    const res = await ads().updateProxy({
        proxy_id: String(proxyId),
        type: 'http',
        host,
        port: String(port),
        user,
        password
    });
    if (isAdsError(res)) throw new Error(`AdsPower rejected update for row ${proxyId}: ${res.msg || JSON.stringify(res)}`);
    return res;
}

/** Returns { ok, count, detail }. Fails closed: ok=false when state cannot be determined. */
async function checkLocalLiveSessions() {
    try {
        const res = await ads().request('/api/v1/browser/local-active');
        if (isAdsError(res) || !res || !Array.isArray(res.list)) {
            return { ok: false, count: null, detail: `Unexpected response: ${JSON.stringify(res).slice(0, 120)}` };
        }
        return { ok: true, count: res.list.length, detail: '' };
    } catch (e) {
        return { ok: false, count: null, detail: e.message };
    }
}

async function liveGuard(force) {
    console.log('🛡️  Live-session guard (THIS machine only — other staff machines cannot be detected):');
    const g = await checkLocalLiveSessions();
    if (!g.ok) {
        console.log(`   ⚠️  Could not determine local sessions (${g.detail}).`);
        if (!force) throw new Error('Guard failed closed. Re-run with --force only if you accept the risk.');
        console.log('   --force given: continuing.');
        return;
    }
    if (g.count > 0 && !force) {
        throw new Error(`${g.count} browser profile(s) open on this machine. Close them or re-run with --force.`);
    }
    console.log(`   ✓ ${g.count} open profile(s) on this machine${g.count > 0 ? ' (--force given)' : ''}.`);
    console.log('   ⚠️  Changing a row affects every staff machine whose profiles use that row.\n');
}

function backupDir() {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'AutoLab', 'AdminSkills', 'backups', 'proxy-sync');
}

function writeBackup(rows, label) {
    const dir = backupDir();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const file = path.join(dir, `${stamp}-${label}.json`);
    const snapshot = rows.map(r => ({
        proxy_id: String(r.proxy_id), type: r.type || 'http', host: r.host, port: String(r.port),
        user: r.user, password: r.password, tags: rowTags(r), profiles: r.related_profile_no || []
    }));
    fs.writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), label, rows: snapshot }, null, 2));
    return file;
}

/**
 * Apply updates, read back, retry mismatches once at a slower pace.
 * @param {Array<{proxyId, host, port, user, password}>} updates
 */
async function applyAndVerify(updates, delayMs) {
    const failures = new Map();
    let i = 0;
    for (const u of updates) {
        i++;
        try {
            await adsUpdateRow(u.proxyId, u.host, u.port, u.user, u.password);
            process.stdout.write(`   ✓ [${i}/${updates.length}] Row ${u.proxyId} -> ${u.host}:${u.port}\n`);
        } catch (e) {
            failures.set(u.proxyId, e.message);
            process.stdout.write(`   ❌ [${i}/${updates.length}] Row ${u.proxyId}: ${e.message}\n`);
        }
        await sleep(delayMs);
    }

    const verify = async () => {
        const rows = await fetchAllAds();
        const byId = new Map(rows.map(r => [String(r.proxy_id), r]));
        return updates.filter(u => {
            const r = byId.get(String(u.proxyId));
            return !r || r.host !== u.host || String(r.port) !== String(u.port) || r.user !== u.user || r.password !== u.password;
        });
    };

    console.log('\n🔍 Read-back verification...');
    await sleep(1000);
    let mismatched = await verify();
    if (mismatched.length > 0) {
        console.log(`   ⚠️  ${mismatched.length} row(s) not matching. Retrying at ${RETRY_DELAY_MS}ms pace...`);
        for (const u of mismatched) {
            try { await adsUpdateRow(u.proxyId, u.host, u.port, u.user, u.password); } catch (e) { failures.set(u.proxyId, e.message); }
            await sleep(RETRY_DELAY_MS);
        }
        await sleep(1000);
        mismatched = await verify();
    }
    return { verified: updates.length - mismatched.length, mismatched };
}

function parseDelay(args) {
    const i = args.indexOf('--delay');
    if (i === -1) return DEFAULT_DELAY_MS;
    const v = Number(args[i + 1]);
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_DELAY_MS;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function printPlan(plan) {
    console.log('📋 Diff Plan');
    console.log(`   • Unchanged (IP still alive, untouched): ${plan.keep.length}`);
    console.log(`   • Credential refresh (same IP, new password): ${plan.credentialRefresh.length}`);
    console.log(`   • Orphan rows to receive a new IP: ${plan.assignments.length}`);
    console.log(`   • Orphan rows WITHOUT an available IP: ${plan.unresolved.length}`);
    console.log(`   • Spare Webshare IPs not used by any row: ${plan.spares.length}`);
    console.log(`   • Unmanaged rows (other provider/username, untouched): ${plan.unmanaged.length}`);
    console.log(`   • Duplicate rows sharing one IP (reported only): ${plan.duplicates.length}\n`);

    for (const a of plan.assignments) {
        console.log(`   ↻ Row ${String(a.row.proxy_id).padStart(3)} [${rowTags(a.row)}] ${adsKey(a.row)} -> ${wsKey(a.ws)}${a.ws.valid === false ? ' (⚠️ Webshare marks invalid)' : ''}`);
    }
    for (const c of plan.credentialRefresh) console.log(`   🔑 Row ${c.row.proxy_id} [${rowTags(c.row)}] ${adsKey(c.row)} password refresh`);
    for (const r of plan.unresolved) console.log(`   ⛔ Row ${r.proxy_id} [${rowTags(r)}] ${adsKey(r)} has no replacement IP available`);
    for (const d of plan.duplicates) console.log(`   ⚠️  Row ${d.proxy_id} [${rowTags(d)}] duplicates IP ${adsKey(d)} — review manually`);
    if (plan.assignments.length || plan.credentialRefresh.length) console.log('');
}

async function syncAll({ apply, force, delayMs }) {
    console.log('================================================================');
    console.log(`⚡ [AutoLab] Diff-Based Proxy Sync — ${apply ? 'APPLY' : 'PLAN ONLY (no changes)'}`);
    console.log('================================================================\n');

    const [wsProxies, adsRows] = await Promise.all([fetchAllWebshare(), fetchAllAds()]);
    console.log(`📡 Webshare: ${wsProxies.length} proxies | AdsPower: ${adsRows.length} rows\n`);

    const plan = planDiffSync(adsRows, wsProxies);
    printPlan(plan);

    const updates = [
        ...plan.assignments.map(a => ({ proxyId: String(a.row.proxy_id), host: a.ws.proxy_address, port: a.ws.port, user: a.ws.username, password: a.ws.password, row: a.row })),
        ...plan.credentialRefresh.map(c => ({ proxyId: String(c.row.proxy_id), host: c.row.host, port: c.row.port, user: c.ws.username, password: c.ws.password, row: c.row }))
    ];

    if (updates.length === 0) {
        console.log('✅ AdsPower already matches Webshare. Nothing to do.');
        return 0;
    }
    if (!apply) {
        console.log(`👉 ${updates.length} row(s) would change. Re-run with --apply to execute.`);
        return 0;
    }

    await liveGuard(force);
    const backup = writeBackup(updates.map(u => u.row), 'sync-all');
    console.log(`💾 Backup of ${updates.length} affected row(s): ${backup}\n`);

    const result = await applyAndVerify(updates, delayMs);
    console.log(`\n📊 Verified ${result.verified}/${updates.length} row(s).`);
    if (result.mismatched.length > 0) {
        console.log(`❌ Unverified rows: ${result.mismatched.map(u => u.proxyId).join(', ')}`);
        console.log(`   Rollback: node .agents/skills/webshare-proxy/scripts/sync-proxies-in-place.js --rollback "${backup}" --apply`);
        return 1;
    }
    if (plan.unresolved.length > 0) {
        console.log(`⚠️  ${plan.unresolved.length} orphan row(s) still have no IP (see ⛔ above).`);
        return 1;
    }
    console.log('🎉 Sync complete. Tags, row IDs and profile bindings untouched; unchanged rows kept their IPs.');
    return 0;
}

async function waitForReplacement(taskId) {
    for (let i = 0; i < REPLACE_POLL_MAX; i++) {
        await sleep(REPLACE_POLL_INTERVAL_MS);
        const status = await webshareRequest(`/api/v3/proxy/replace/${taskId}/`);
        process.stdout.write(`   Poll ${i + 1}: ${status.state}\r`);
        if (status.state === 'completed') { process.stdout.write('\n'); return status; }
        if (status.state === 'failed' || status.state === 'error' || status.state === 'cancelled') {
            throw new Error(`Webshare replacement ${taskId} ended with state "${status.state}".`);
        }
    }
    throw new Error(`Webshare replacement ${taskId} not completed after ${REPLACE_POLL_MAX * REPLACE_POLL_INTERVAL_MS / 1000}s.`);
}

async function swapSingle({ proxyId, oldIp, apply }) {
    console.log('================================================================');
    console.log(`🔄 [AutoLab] Single In-Place Proxy Replacement — ${apply ? 'APPLY' : 'PLAN ONLY (no changes)'}`);
    console.log('================================================================\n');

    const [wsBefore, adsRows] = await Promise.all([fetchAllWebshare(), fetchAllAds()]);
    const target = proxyId
        ? adsRows.find(r => String(r.proxy_id) === String(proxyId))
        : adsRows.filter(r => r.host === oldIp);

    let row = target;
    if (Array.isArray(target)) {
        if (target.length === 0) throw new Error(`No AdsPower row uses IP ${oldIp}.`);
        if (target.length > 1) throw new Error(`IP ${oldIp} is used by rows ${target.map(r => r.proxy_id).join(', ')}. Use --proxy-id.`);
        row = target[0];
    }
    if (!row) throw new Error(`AdsPower row ${proxyId} not found.`);

    const wsRecord = wsBefore.find(p => wsKey(p) === adsKey(row));
    if (!wsRecord) {
        throw new Error(`Row ${row.proxy_id} (${adsKey(row)}) is no longer in Webshare. It is already replaced — run the diff sync instead (npm run proxy:sync-all).`);
    }

    console.log(`📍 Row ${row.proxy_id} [${rowTags(row)}] profiles ${(row.related_profile_no || []).join(', ') || '-'}`);
    console.log(`   Current: ${adsKey(row)} (${wsRecord.country_code}, valid=${wsRecord.valid})`);
    console.log('   Action: Webshare v3 replace (consumes 1 replacement from quota) -> update this row in place.\n');
    if (!apply) {
        console.log('👉 Plan only. Re-run with --apply to execute.');
        return 0;
    }

    const beforeKeys = new Set(wsBefore.map(wsKey));
    const country = wsRecord.country_code || 'SG';
    console.log(`🌐 Replacing ${row.host} with a new ${country} IP...`);
    const trigger = await webshareRequest('/api/v3/proxy/replace/', 'POST', {
        to_replace: { type: 'ip_address', ip_addresses: [row.host] },
        replace_with: [{ type: 'country', country_code: country }],
        dry_run: false
    });
    if (!trigger || !trigger.id) throw new Error(`Webshare replace failed: ${JSON.stringify(trigger).slice(0, 200)}`);
    console.log(`⏳ Task ${trigger.id} started.`);
    await waitForReplacement(trigger.id);

    // Identify the new IP by set-difference (not by "newest created_at").
    const usedKeys = new Set(adsRows.map(adsKey));
    let candidates = [];
    for (let i = 0; i < 5 && candidates.length === 0; i++) {
        await sleep(i === 0 ? 1000 : 2000);
        const wsAfter = await fetchAllWebshare();
        candidates = wsAfter.filter(p => !beforeKeys.has(wsKey(p)) && !usedKeys.has(wsKey(p)));
    }
    if (candidates.length === 0) {
        throw new Error('Webshare replaced the IP but the new IP is not visible yet. Run "npm run proxy:sync-all" (plan) in a minute — it will heal this row only.');
    }
    if (candidates.length > 1) console.log(`   ⚠️  ${candidates.length} new IPs appeared (concurrent replacement?). Using the earliest-created one.`);
    candidates.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    const fresh = candidates[0];
    console.log(`✨ New IP: ${wsKey(fresh)} (${fresh.country_code})`);

    const backup = writeBackup([row], `swap-row-${row.proxy_id}`);
    console.log(`💾 Backup: ${backup}`);

    const result = await applyAndVerify([{ proxyId: String(row.proxy_id), host: fresh.proxy_address, port: fresh.port, user: fresh.username, password: fresh.password }], DEFAULT_DELAY_MS);
    if (result.mismatched.length > 0) {
        console.log('❌ AdsPower row not verified. The Webshare side is already replaced; run "npm run proxy:sync-all -- --apply" to heal this row.');
        return 1;
    }
    console.log(`🎉 Row ${row.proxy_id} now uses ${wsKey(fresh)}. Tags and profile bindings untouched.`);
    return 0;
}

async function rollback({ file, apply, force, delayMs }) {
    console.log('================================================================');
    console.log(`⏪ [AutoLab] Proxy Row Rollback — ${apply ? 'APPLY' : 'PLAN ONLY (no changes)'}`);
    console.log('================================================================\n');
    if (!file || !fs.existsSync(file)) throw new Error(`Backup file not found: ${file}`);
    const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(backup.rows)) throw new Error('Invalid backup file (missing rows).');

    const current = await fetchAllAds();
    const { changes, missing } = planRollback(current, backup.rows);
    console.log(`📋 ${changes.length} row(s) differ from backup; ${missing.length} backup row(s) no longer exist.`);
    for (const c of changes) console.log(`   ⏪ Row ${c.row.proxy_id}: ${adsKey(c.row)} -> ${c.target.host}:${c.target.port}`);
    if (changes.length === 0) { console.log('✅ Nothing to roll back.'); return 0; }
    if (!apply) { console.log('\n👉 Plan only. Re-run with --apply to execute.'); return 0; }

    await liveGuard(force);
    const pre = writeBackup(changes.map(c => c.row), 'pre-rollback');
    console.log(`💾 Pre-rollback backup: ${pre}\n`);
    const result = await applyAndVerify(changes.map(c => ({ proxyId: String(c.row.proxy_id), host: c.target.host, port: c.target.port, user: c.target.user, password: c.target.password })), delayMs);
    console.log(`\n📊 Verified ${result.verified}/${changes.length} row(s).`);
    console.log('⚠️  Note: restored IPs only work if Webshare still serves them.');
    return result.mismatched.length > 0 ? 1 : 0;
}

const HELP = `
AutoLab Proxy In-Place Sync & Swap Tool (diff-based, plan-by-default)

Usage:
  --sync-all [--apply] [--force] [--delay <ms>]   Heal only rows whose IP disappeared from Webshare
  --proxy-id <ID> [--apply]                        Replace one row's IP (consumes 1 Webshare replacement)
  --old-ip <IP>   [--apply]                        Same, selecting the row by its current IP
  --rollback <backup.json> [--apply] [--force]     Restore rows from a backup snapshot

Without --apply every command only prints its plan.
--force overrides the live-session guard (this machine only) and guard failures.

npm shortcuts (flags are baked in — works in PowerShell, cmd and bash):
  npm run proxy:sync-all                  (plan)
  npm run proxy:sync-apply                (execute)
  npm run proxy:swap 21                   (plan, row 21)
  npm run proxy:swap-apply 21             (execute, row 21)
  npm run proxy:rollback <file>           (plan)
  npm run proxy:rollback-apply <file>     (execute)

Need --force? npm swallows it — call node directly:
  node .agents/skills/webshare-proxy/scripts/sync-proxies-in-place.js --sync-all --apply --force
`;

async function main(args) {
    if (args.length === 0 || args.includes('--help')) { console.log(HELP); return 0; }
    const apply = args.includes('--apply');
    const force = args.includes('--force');
    const delayMs = parseDelay(args);
    const valueOf = flag => { const i = args.indexOf(flag); return i === -1 ? undefined : args[i + 1]; };

    if (args.includes('--sync-all')) return syncAll({ apply, force, delayMs });
    if (args.includes('--proxy-id')) return swapSingle({ proxyId: valueOf('--proxy-id'), apply });
    if (args.includes('--old-ip')) return swapSingle({ oldIp: valueOf('--old-ip'), apply });
    if (args.includes('--rollback')) return rollback({ file: valueOf('--rollback'), apply, force, delayMs });
    console.error('Unknown command. Run with --help.');
    return 1;
}

if (require.main === module) {
    main(process.argv.slice(2))
        .then(code => { process.exitCode = code; })
        .catch(err => { console.error(`\n❌ Error: ${err.message}`); process.exitCode = 1; });
}

module.exports = { planDiffSync, planRollback, isAdsError, wsKey, adsKey };
