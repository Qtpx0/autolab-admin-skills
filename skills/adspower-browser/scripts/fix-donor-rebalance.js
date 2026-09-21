const api = require('./api-client');

async function fixDonorRebalance() {
    console.log('================================================================');
    console.log('🔧 [Fix] Moving Donor Profiles to their Intended Proxies');
    console.log('================================================================\n');

    // 1. Ton profiles: 65 -> 15, 78 -> 16, 71 -> 17, 64 -> 18
    console.log('▶ [1/4] Moving Project Ton profiles...');
    const profsTon = await api.listProfiles({ group_id: '10577144', page_size: 100 });
    await api.sleep(1400);

    const tonMoves = [
        { serial: '65', targetProxy: '15' },
        { serial: '78', targetProxy: '16' },
        { serial: '71', targetProxy: '17' },
        { serial: '64', targetProxy: '18' }
    ];

    for (const m of tonMoves) {
        const p = profsTon.list.find(x => x.serial_number === m.serial);
        if (p) {
            console.log(`  Moving Ton "${p.name}" (serial ${m.serial}) -> Proxy ${m.targetProxy}...`);
            await api.bindProxyPool(p.user_id, m.targetProxy);
            await api.sleep(1400);
        } else {
            console.warn(`  ! Ton serial ${m.serial} not found`);
        }
    }

    // 2. Boy profiles: 128 -> 36, 122 -> 35
    console.log('\n▶ [2/4] Moving Project Boy profiles...');
    const gBoy = (await api.listGroups()).list.find(g => g.group_name === 'Project Boy');
    await api.sleep(1400);
    const profsBoy = await api.listProfiles({ group_id: gBoy.group_id, page_size: 100 });
    await api.sleep(1400);

    const boyMoves = [
        { serial: '128', targetProxy: '36' },
        { serial: '122', targetProxy: '35' }
    ];

    for (const m of boyMoves) {
        const p = profsBoy.list.find(x => x.serial_number === m.serial);
        if (p) {
            console.log(`  Moving Boy "${p.name}" (serial ${m.serial}) -> Proxy ${m.targetProxy}...`);
            await api.bindProxyPool(p.user_id, m.targetProxy);
            await api.sleep(1400);
        } else {
            console.warn(`  ! Boy serial ${m.serial} not found`);
        }
    }

    // 3. Bow profiles: 91 -> 46, 85 -> 45
    console.log('\n▶ [3/4] Moving Project Bow profiles...');
    const gBow = (await api.listGroups()).list.find(g => g.group_name === 'Project Bow');
    await api.sleep(1400);
    const profsBow = await api.listProfiles({ group_id: gBow.group_id, page_size: 100 });
    await api.sleep(1400);

    const bowMoves = [
        { serial: '91', targetProxy: '46' },
        { serial: '85', targetProxy: '45' }
    ];

    for (const m of bowMoves) {
        const p = profsBow.list.find(x => x.serial_number === m.serial);
        if (p) {
            console.log(`  Moving Bow "${p.name}" (serial ${m.serial}) -> Proxy ${m.targetProxy}...`);
            await api.bindProxyPool(p.user_id, m.targetProxy);
            await api.sleep(1400);
        } else {
            console.warn(`  ! Bow serial ${m.serial} not found`);
        }
    }

    // 4. Verification of the 5 proxies
    console.log('\n================================================================');
    console.log('🔍 [Verification] Checking Final Status on Proxies 6, 19, 20, 37, 50');
    console.log('================================================================');
    await api.sleep(1400);
    const proxiesRes = await api.listProxies(1, 100);
    const list = proxiesRes.list || [];

    ['6', '19', '20', '37', '50'].forEach(id => {
        const p = list.find(x => x.proxy_id === id);
        console.log(`  • Proxy ${id.padStart(2, ' ')} : Count = ${p?.profile_count} | Profiles = [${(p?.related_profile_no || []).join(', ')}] | Remark = "${p?.remark}"`);
    });

    console.log('\n✅ Fix Completed Successfully!');
}

if (require.main === module) {
    fixDonorRebalance().catch(err => {
        console.error('[FATAL]:', err);
        process.exit(1);
    });
}
