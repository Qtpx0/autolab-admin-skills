/**
 * Offline contract test for the diff-based proxy sync planner.
 * Run: npm run test:proxy-sync
 * Uses fake fixtures only — no network, no credentials, no AdsPower.
 */
const assert = require('assert');
const { planDiffSync, planRollback, isAdsError } = require('./sync-proxies-in-place');

const USER = 'fakeuser';
const ws = (ip, port, extra = {}) => ({ id: `d-${ip}`, username: USER, password: 'pw', proxy_address: ip, port, valid: true, created_at: '2026-10-03T00:00:00Z', ...extra });
const row = (id, ip, port, extra = {}) => ({ proxy_id: String(id), type: 'http', host: ip, port: String(port), user: USER, password: 'pw', proxy_tags: [{ name: `Team${id}` }], ...extra });
const shuffle = arr => [...arr].reverse();

let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('test-sync-proxies-in-place');

test('full pool reset: every orphan row gets exactly one new IP, ordered by row id', () => {
    const rows = [row(2, '82.0.0.2', 2), row(1, '82.0.0.1', 1), row(3, '82.0.0.3', 3)];
    const fresh = [ws('212.0.0.3', 13, { created_at: '2026-10-03T03:00:00Z' }), ws('212.0.0.1', 11, { created_at: '2026-10-03T01:00:00Z' }), ws('212.0.0.2', 12, { created_at: '2026-10-03T02:00:00Z' })];
    const plan = planDiffSync(rows, fresh);
    assert.strictEqual(plan.assignments.length, 3);
    assert.deepStrictEqual(plan.assignments.map(a => a.row.proxy_id), ['1', '2', '3']);
    assert.deepStrictEqual(plan.assignments.map(a => a.ws.proxy_address), ['212.0.0.1', '212.0.0.2', '212.0.0.3']);
    assert.strictEqual(new Set(plan.assignments.map(a => a.ws.proxy_address)).size, 3);
});

test('partial replacement: only orphan rows change, alive IPs never move (no reshuffle)', () => {
    const rows = [row(1, '212.0.0.1', 11), row(2, '212.0.0.2', 12), row(3, '82.9.9.9', 99), row(4, '212.0.0.4', 14)];
    const pool = shuffle([ws('212.0.0.1', 11), ws('212.0.0.2', 12), ws('212.0.0.4', 14), ws('212.0.0.50', 50)]);
    const plan = planDiffSync(rows, pool);
    assert.strictEqual(plan.keep.length, 3);
    assert.strictEqual(plan.assignments.length, 1);
    assert.strictEqual(plan.assignments[0].row.proxy_id, '3');
    assert.strictEqual(plan.assignments[0].ws.proxy_address, '212.0.0.50');
});

test('nothing changed + shuffled Webshare order: zero updates', () => {
    const rows = [row(1, '212.0.0.1', 11), row(2, '212.0.0.2', 12)];
    const plan = planDiffSync(rows, shuffle([ws('212.0.0.1', 11), ws('212.0.0.2', 12)]));
    assert.strictEqual(plan.assignments.length + plan.credentialRefresh.length, 0);
});

test('unmanaged rows (other username/provider) are never touched', () => {
    const rows = [row(1, '10.0.0.1', 1, { user: 'otherprovider' }), row(2, '82.0.0.2', 2)];
    const plan = planDiffSync(rows, [ws('212.0.0.9', 9)]);
    assert.strictEqual(plan.unmanaged.length, 1);
    assert.strictEqual(plan.unmanaged[0].proxy_id, '1');
    assert.strictEqual(plan.assignments.length, 1);
    assert.strictEqual(plan.assignments[0].row.proxy_id, '2');
});

test('same IP with rotated password: credential refresh only, IP unchanged', () => {
    const plan = planDiffSync([row(1, '212.0.0.1', 11)], [ws('212.0.0.1', 11, { password: 'newpw' })]);
    assert.strictEqual(plan.credentialRefresh.length, 1);
    assert.strictEqual(plan.assignments.length, 0);
});

test('more orphans than new IPs: extra rows reported as unresolved; more IPs than orphans: spares', () => {
    const a = planDiffSync([row(1, '82.0.0.1', 1), row(2, '82.0.0.2', 2)], [ws('212.0.0.1', 11)]);
    assert.strictEqual(a.assignments.length, 1);
    assert.strictEqual(a.unresolved.length, 1);
    assert.strictEqual(a.unresolved[0].proxy_id, '2');
    const b = planDiffSync([row(1, '82.0.0.1', 1)], [ws('212.0.0.1', 11), ws('212.0.0.2', 12)]);
    assert.strictEqual(b.spares.length, 1);
});

test('invalid Webshare proxies are assigned last', () => {
    const plan = planDiffSync([row(1, '82.0.0.1', 1)], [ws('212.0.0.1', 11, { valid: false, created_at: '2026-01-01T00:00:00Z' }), ws('212.0.0.2', 12)]);
    assert.strictEqual(plan.assignments[0].ws.proxy_address, '212.0.0.2');
});

test('duplicate rows sharing one IP are reported, not auto-modified', () => {
    const plan = planDiffSync([row(1, '212.0.0.1', 11), row(2, '212.0.0.1', 11)], [ws('212.0.0.1', 11), ws('212.0.0.2', 12)]);
    assert.strictEqual(plan.duplicates.length, 1);
    assert.strictEqual(plan.duplicates[0].proxy_id, '2');
    assert.strictEqual(plan.assignments.length, 0);
});

test('rollback plan lists only rows that differ from the backup', () => {
    const current = [row(1, '212.0.0.1', 11), row(2, '212.0.0.2', 12)];
    const backup = [{ proxy_id: '1', host: '212.0.0.1', port: '11', user: USER, password: 'pw' }, { proxy_id: '2', host: '82.0.0.2', port: '2', user: USER, password: 'pw' }, { proxy_id: '9', host: 'x', port: '1', user: USER, password: 'pw' }];
    const plan = planRollback(current, backup);
    assert.strictEqual(plan.changes.length, 1);
    assert.strictEqual(plan.changes[0].row.proxy_id, '2');
    assert.strictEqual(plan.missing.length, 1);
});

test('isAdsError detects AdsPower error payloads', () => {
    assert.strictEqual(isAdsError({ code: -1, msg: 'Require user_id or serial_number' }), true);
    assert.strictEqual(isAdsError({ code: 0, data: {} }), false);
    assert.strictEqual(isAdsError({ list: [] }), false);
    assert.strictEqual(isAdsError(null), false);
});

console.log(`\nPASS ${passed} tests`);
