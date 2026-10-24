const api = require('./api-client');
const { verifyUpstreamSync } = require('./admin-kit-core');

/**
 * High-Speed AutoLab Fleet Rebalance Script: 5 Proxies -> 4 Proxies per Team
 * Redistributes the 5th proxy's profiles to the remaining 4 proxies within each team.
 * Frees up exactly 20 proxies and updates their remarks to "[ว่าง] คลังกลาง AutoLab #XX".
 */
async function rebalanceFleetTo4() {
    await verifyUpstreamSync();
    console.log('================================================================');
    console.log('⚡ [AutoLab Turbo Rebalance] Reducing Fleet to 4 Proxies / Team');
    console.log('🎯 Target: 20 Teams x 4 Proxies = 80 Proxies (Freeing up 20 IPs)');
    console.log('================================================================\n');

    // 1. Fetch all proxies
    const p1 = await api.listProxies(1, 100);
    const allProxies = p1.list || [];

    // Map proxies by team tag / remark
    const teamProxies = {};
    allProxies.forEach(p => {
        let tag = (p.proxy_tags && p.proxy_tags[0] && p.proxy_tags[0].name) || '';
        if (!tag && p.remark) {
            const m = p.remark.match(/(Project\s+[A-Za-z0-9]+)/i);
            if (m) tag = m[1];
        }
        if (!teamProxies[tag]) teamProxies[tag] = [];
        teamProxies[tag].push(p);
    });

    // 2. Fetch all groups
    const groupsRes = await api.listGroups();
    const groupList = groupsRes.list || [];

    let freedCount = 0;
    let movedProfilesCount = 0;

    const teamNames = Object.keys(teamProxies).sort();

    for (let tIdx = 0; tIdx < teamNames.length; tIdx++) {
        const tName = teamNames[tIdx];
        const pList = teamProxies[tName];
        if (!pList || pList.length < 5) {
            console.log(`[${tIdx + 1}/${teamNames.length}] ${tName.padEnd(16)} : Already has ${pList ? pList.length : 0} proxies (skipping)`);
            continue;
        }

        // Sort proxies numerically
        pList.sort((a, b) => parseInt(a.proxy_id, 10) - parseInt(b.proxy_id, 10));
        const keepProxies = pList.slice(0, 4);
        const donorProxy = pList[4]; // 5th proxy

        console.log(`\n▶ [${tIdx + 1}/${teamNames.length}] ${tName}: Freeing Proxy ${donorProxy.proxy_id} (Keep: [${keepProxies.map(x => x.proxy_id).join(', ')}])...`);

        // Find group ID
        const normT = tName.toLowerCase().replace(/\s+/g, '');
        const grp = groupList.find(g => {
            const normG = g.group_name.toLowerCase().replace(/\s+/g, '');
            return normG === normT ||
                   (normT.includes('aor') && normG.includes('aor')) ||
                   (normT.includes('ninew') && normG.includes('ninew'));
        });

        if (!grp) {
            console.warn(`  ⚠️ Group not found in AdsPower for "${tName}"`);
            continue;
        }

        // Fetch profiles of this group
        const profRes = await api.listProfiles({ group_id: grp.group_id, page_size: 100 });
        const profs = profRes.list || [];

        // Find profiles sitting on donorProxy
        const profilesOnDonor = profs.filter(p => {
            const pid = p.fbcc_proxy_acc_id || (p.user_proxy_config && p.user_proxy_config.proxy_id);
            return String(pid) === String(donorProxy.proxy_id);
        });

        console.log(`  Profiles to move off Proxy ${donorProxy.proxy_id}: ${profilesOnDonor.length}`);

        // Track distribution on keepProxies
        const keepUsage = {};
        keepProxies.forEach(kp => {
            keepUsage[kp.proxy_id] = profs.filter(p => {
                const pid = p.fbcc_proxy_acc_id || (p.user_proxy_config && p.user_proxy_config.proxy_id);
                return String(pid) === String(kp.proxy_id);
            }).length;
        });

        // Move each profile to the least-loaded keepProxy
        for (const prof of profilesOnDonor) {
            // Find keep proxy with lowest count
            let bestProxyId = keepProxies[0].proxy_id;
            let lowestCount = Infinity;
            for (const kp of keepProxies) {
                if (keepUsage[kp.proxy_id] < lowestCount) {
                    lowestCount = keepUsage[kp.proxy_id];
                    bestProxyId = kp.proxy_id;
                }
            }

            console.log(`  -> Moving "${prof.name}" (Serial: ${prof.serial_number}) -> Proxy ${bestProxyId}...`);
            await api.bindProxyPool(prof.user_id, bestProxyId);
            keepUsage[bestProxyId]++;
            movedProfilesCount++;
            await api.sleep(400); // Turbo 400ms pause
        }

        // Update remark on donor proxy
        freedCount++;
        const numStr = String(freedCount).padStart(2, '0');
        const newRemark = `[ว่าง] คลังกลาง AutoLab #${numStr} (คืนจาก ${tName})`;
        console.log(`  -> Updating Proxy ${donorProxy.proxy_id} remark: "${newRemark}"...`);
        await api.updateProxy({ proxy_id: donorProxy.proxy_id, remark: newRemark });
        await api.sleep(400);
    }

    console.log('\n================================================================');
    console.log(`🎉 [REBALANCE COMPLETED] Freed ${freedCount} Proxies! Moved ${movedProfilesCount} Profiles.`);
    console.log('================================================================\n');

    // Run quick verification
    console.log('🔍 Running Post-Rebalance Verification...');
    await api.sleep(1000);
    const verifyProxies = (await api.listProxies(1, 100)).list || [];
    const freedList = verifyProxies.filter(p => (p.remark || '').includes('[ว่าง]'));

    console.table(freedList.map(p => ({
        'Proxy ID': p.proxy_id,
        'Profile Count': p.profile_count,
        'Remark': p.remark
    })));
}

if (require.main === module) {
    rebalanceFleetTo4().catch(err => {
        console.error('[FATAL ERROR]:', err);
        process.exit(1);
    });
}

module.exports = { rebalanceFleetTo4 };
