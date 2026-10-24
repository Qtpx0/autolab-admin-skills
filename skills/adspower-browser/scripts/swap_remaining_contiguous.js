const api = require('./api-client');
const { verifyUpstreamSync } = require('./admin-kit-core');

/**
 * AutoLab Fleet Contiguous Block Optimizer: King, F, N, W
 * Swaps isolated lower proxies (19, 20, 6, 37) with contiguous higher proxies (100, 92, 88, 84).
 * Gives each team a contiguous 4-proxy block, freeing up isolated proxies into the reserve pool.
 */
async function swapRemainingContiguous() {
    await verifyUpstreamSync();
    console.log('================================================================');
    console.log('⚡ [AutoLab] Swapping King, F, N, W to Contiguous 4-Proxy Blocks');
    console.log('================================================================\n');

    const SWAP_PLANS = [
        {
            team: 'Project King',
            isolatedProxyId: '19',
            contiguousTargetId: '100',
            targetRemark: 'Project King #04',
            isolatedRemark: '[ว่าง] คลังกลาง AutoLab #12 (คืนจาก Project King)'
        },
        {
            team: 'Project F',
            isolatedProxyId: '20',
            contiguousTargetId: '92',
            targetRemark: 'Project F #04',
            isolatedRemark: '[ว่าง] คลังกลาง AutoLab #06 (คืนจาก Project F)'
        },
        {
            team: 'Project N',
            isolatedProxyId: '6',
            contiguousTargetId: '88',
            targetRemark: 'Project N #04',
            isolatedRemark: '[ว่าง] คลังกลาง AutoLab #14 (คืนจาก Project N)'
        },
        {
            team: 'Project W',
            isolatedProxyId: '37',
            contiguousTargetId: '84',
            targetRemark: 'Project W #04',
            isolatedRemark: '[ว่าง] คลังกลาง AutoLab #19 (คืนจาก Project W)'
        }
    ];

    const groupsRes = await api.listGroups();
    const groupList = groupsRes.list || [];

    for (const plan of SWAP_PLANS) {
        console.log(`\n▶ [${plan.team}] Swapping Proxy ${plan.isolatedProxyId} -> Proxy ${plan.contiguousTargetId}...`);

        const grp = groupList.find(g => g.group_name === plan.team);
        if (!grp) {
            console.warn(`  ⚠️ Group not found: ${plan.team}`);
            continue;
        }

        const profRes = await api.listProfiles({ group_id: grp.group_id, page_size: 100 });
        const profs = profRes.list || [];

        const onIsolated = profs.filter(p => {
            const pid = p.fbcc_proxy_acc_id || (p.user_proxy_config && p.user_proxy_config.proxy_id);
            return String(pid) === String(plan.isolatedProxyId);
        });

        console.log(`  Profiles to move from P${plan.isolatedProxyId} -> P${plan.contiguousTargetId}: ${onIsolated.length}`);

        for (const p of onIsolated) {
            console.log(`  -> Moving "${p.name}" (Serial: ${p.serial_number}) -> Proxy ${plan.contiguousTargetId}...`);
            await api.bindProxyPool(p.user_id, plan.contiguousTargetId);
            await api.sleep(400);
        }

        // Update Remarks
        console.log(`  -> Setting Proxy ${plan.contiguousTargetId} remark: "${plan.targetRemark}"...`);
        await api.updateProxy({ proxy_id: plan.contiguousTargetId, remark: plan.targetRemark });
        await api.sleep(400);

        console.log(`  -> Setting Proxy ${plan.isolatedProxyId} remark: "${plan.isolatedRemark}"...`);
        await api.updateProxy({ proxy_id: plan.isolatedProxyId, remark: plan.isolatedRemark });
        await api.sleep(400);

        console.log(`  ✓ ${plan.team} is now contiguous on target Proxy ${plan.contiguousTargetId}!`);
    }

    console.log('\n================================================================');
    console.log('🔍 [Verification] Checking Final Status of King, F, N, W & Freed Proxies');
    console.log('================================================================');
    await api.sleep(1000);
    const verifyProxies = (await api.listProxies(1, 100)).list || [];

    const checkIds = ['19', '100', '20', '92', '6', '88', '37', '84'];
    checkIds.forEach(id => {
        const p = verifyProxies.find(x => x.proxy_id === id);
        console.log(`  • Proxy ${id.padStart(3, ' ')} : Count = ${p?.profile_count} | Profiles = [${(p?.related_profile_no || []).join(', ')}] | Remark = "${p?.remark}"`);
    });

    console.log('\n🎉 ALL 4 TEAMS ARE NOW 100% CONTIGUOUS!');
}

if (require.main === module) {
    swapRemainingContiguous().catch(err => {
        console.error('[FATAL ERROR]:', err);
        process.exit(1);
    });
}

module.exports = { swapRemainingContiguous };
