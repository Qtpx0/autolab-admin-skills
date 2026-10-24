const api = require('./api-client');
const { verifyUpstreamSync } = require('./admin-kit-core');

/**
 * AutoLab Reserve Pool Re-Sequencing Script
 * Deletes the 20 freed proxies (with 0 profiles) and re-creates them in a single batch
 * so AdsPower assigns them contiguous sequential IDs (101 to 120).
 */
async function resequenceReserveProxies() {
    await verifyUpstreamSync();
    console.log('================================================================');
    console.log('⚡ [AutoLab] Re-sequencing 20 Reserve Proxies into 101–120 Block');
    console.log('================================================================\n');

    // 1. Fetch all proxies
    const p1 = await api.listProxies(1, 100);
    const allProxies = p1.list || [];

    // Find all 20 freed proxies
    const freedProxies = allProxies.filter(p => 
        (p.remark || '').includes('[ว่าง]') && (p.profile_count === 0 || p.profile_count === '0' || !p.profile_count)
    );

    console.log(`Found ${freedProxies.length} freed proxies to re-sequence.`);
    if (freedProxies.length !== 20) {
        throw new Error(`Expected exactly 20 freed proxies, but found ${freedProxies.length}! Aborting for safety.`);
    }

    // Sort by previous proxy_id numerically for consistent ordering
    freedProxies.sort((a, b) => parseInt(a.proxy_id, 10) - parseInt(b.proxy_id, 10));

    // Prepare payload for creation
    const newProxiesPayload = freedProxies.map((p, idx) => {
        const numStr = String(idx + 1).padStart(2, '0');
        return {
            type: p.type || 'http',
            host: p.host,
            port: String(p.port),
            user: p.user,
            password: p.password,
            remark: `[ว่าง] คลังกลาง AutoLab #${numStr}`,
            ipchecker: p.ipchecker || 'ip2location'
        };
    });

    const oldProxyIds = freedProxies.map(p => String(p.proxy_id));
    console.log(`\nOld Proxy IDs to delete: [${oldProxyIds.join(', ')}]`);

    // Safety backup to disk
    const fs = require('fs');
    const path = require('path');
    const backupPath = path.join(__dirname, 'freed-proxies-backup.json');
    fs.writeFileSync(backupPath, JSON.stringify(freedProxies, null, 2), 'utf8');
    console.log(`🔒 Saved local safety backup of 20 proxies to ${backupPath}`);

    // 2. Delete old proxies
    console.log('\n--- Step 1: Deleting the 20 freed proxies from AdsPower ---');
    const deleteRes = await api.deleteProxies(oldProxyIds);
    console.log('Delete Response:', deleteRes);
    await api.sleep(1500);

    // 3. Create new proxies in single batch
    console.log('\n--- Step 2: Creating 20 contiguous proxies in single batch ---');
    const createRes = await api.createProxies(newProxiesPayload);
    console.log('Create Response:', createRes);
    await api.sleep(1500);

    // 4. Verify newly created proxies
    console.log('\n================================================================');
    console.log('🔍 [Verification] Checking Newly Sequenced Proxies in AdsPower');
    console.log('================================================================');
    const verifyRes = await api.listProxies(1, 100);
    const verifyProxies = verifyRes.list || [];

    // Also check page 2 in case total > 100
    const verifyRes2 = await api.listProxies(2, 100);
    const fullList = [...verifyProxies, ...(verifyRes2.list || [])];

    const newlyCreated = fullList.filter(p => (p.remark || '').includes('[ว่าง] คลังกลาง AutoLab'));
    newlyCreated.sort((a, b) => parseInt(a.proxy_id, 10) - parseInt(b.proxy_id, 10));

    console.log(`Total Reserve Proxies now: ${newlyCreated.length}`);
    console.table(newlyCreated.map(p => ({
        'Proxy ID': p.proxy_id,
        'Host:Port': `${p.host}:${p.port}`,
        'Profile Count': p.profile_count,
        'Remark': p.remark
    })));

    console.log('\n🎉 RE-SEQUENCING COMPLETED SUCCESSFULLY!');
    if (newlyCreated.length > 0) {
        console.log(`✨ Contiguous Block Range: Proxy ID ${newlyCreated[0].proxy_id} to ${newlyCreated[newlyCreated.length - 1].proxy_id}!`);
    }
}

if (require.main === module) {
    resequenceReserveProxies().catch(err => {
        console.error('[FATAL ERROR]:', err);
        process.exit(1);
    });
}

module.exports = { resequenceReserveProxies };
