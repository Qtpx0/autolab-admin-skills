const api = require('./api-client');
const { verifyUpstreamSync } = require('./admin-kit-core');

/**
 * AutoLab Fleet Proxy Re-Balancing Script
 * Re-distributes 5 proxies from overloaded teams to under-allocated teams
 * so that EVERY single employee in the 20-person workforce has EXACTLY 5 PROXIES.
 */
async function rebalanceFleetProxies() {
    await verifyUpstreamSync();
    console.log('================================================================');
    console.log('⚖️  [AutoLab] Re-Balancing Proxies to Exactly 5 Per Employee');
    console.log('📋 Target: 20 Employees x 5 Proxies = 100 Proxies (100% Equal)');
    console.log('================================================================\n');

    // 1. Load all groups
    const groupsRes = await api.listGroups();
    const groupList = groupsRes.list || [];
    const getGroup = (name) => groupList.find(g => g.group_name.toLowerCase().trim() === name.toLowerCase().trim());

    // Helper to get profiles for a group
    async function getProfiles(groupName) {
        const g = getGroup(groupName);
        if (!g) throw new Error(`Group not found: ${groupName}`);
        const res = await api.listProfiles({ group_id: g.group_id, page_size: 100 });
        return res.list || [];
    }

    // ── STEP 1: FREE UP 5 PROXIES FROM DONOR TEAMS ──
    console.log('--- Step 1: Freeing up 5 Proxies from Donor Teams ---');

    // 1A. Project H: Free up Proxy 6 by moving profile serial '19' to Proxy 12
    console.log('  [1/5] Project H: Moving profile 19 from Proxy 6 -> Proxy 12...');
    const profsH = await getProfiles('Project H');
    const pH19 = profsH.find(p => p.serial_number === '19');
    if (pH19) {
        await api.bindProxyPool(pH19.user_id, '12');
        console.log(`    ✓ Moved "${pH19.name}" (serial 19) to Proxy 12`);
    }

    // 1B. Project Boy: Free up Proxy 37 by moving Boy 06 (serial 122) -> Proxy 35, Boy 12 (serial 128) -> Proxy 36
    console.log('  [2/5] Project Boy: Moving Boy 06 -> Proxy 35, Boy 12 -> Proxy 36...');
    const profsBoy = await getProfiles('Project Boy');
    const pBoy06 = profsBoy.find(p => p.name === 'Boy 06' || p.serial_number === '122');
    const pBoy12 = profsBoy.find(p => p.name === 'Boy 12' || p.serial_number === '128');
    if (pBoy06) {
        await api.bindProxyPool(pBoy06.user_id, '35');
        console.log(`    ✓ Moved "${pBoy06.name}" to Proxy 35`);
    }
    if (pBoy12) {
        await api.bindProxyPool(pBoy12.user_id, '36');
        console.log(`    ✓ Moved "${pBoy12.name}" to Proxy 36`);
    }

    // 1C. Project Ton: Free up Proxy 20 & Proxy 19 by moving profiles to 14, 15, 16, 17, 18
    console.log('  [3/5 & 4/5] Project Ton: Moving profiles off Proxy 20 & Proxy 19...');
    const profsTon = await getProfiles('Project Ton');
    const pTon72 = profsTon.find(p => p.serial_number === '72');
    const pTon65 = profsTon.find(p => p.serial_number === '65');
    const pTon78 = profsTon.find(p => p.serial_number === '78');
    const pTon71 = profsTon.find(p => p.serial_number === '71');
    const pTon64 = profsTon.find(p => p.serial_number === '64');

    if (pTon72) await api.bindProxyPool(pTon72.user_id, '14');
    if (pTon65) await api.bindProxyPool(pTon65.user_id, '15');
    if (pTon78) await api.bindProxyPool(pTon78.user_id, '16');
    if (pTon71) await api.bindProxyPool(pTon71.user_id, '17');
    if (pTon64) await api.bindProxyPool(pTon64.user_id, '18');
    console.log('    ✓ Moved 5 profiles off Proxy 20 & 19 -> 14, 15, 16, 17, 18');

    // 1D. Project Bow: Free up Proxy 50 by moving Bow 06 -> Proxy 45, Bow 12 -> Proxy 46
    console.log('  [5/5] Project Bow: Moving Bow 06 -> Proxy 45, Bow 12 -> Proxy 46...');
    const profsBow = await getProfiles('Project Bow');
    const pBow06 = profsBow.find(p => p.name === 'Bow 06' || p.serial_number === '85');
    const pBow12 = profsBow.find(p => p.name === 'Bow 12' || p.serial_number === '91');
    if (pBow06) {
        await api.bindProxyPool(pBow06.user_id, '45');
        console.log(`    ✓ Moved "${pBow06.name}" to Proxy 45`);
    }
    if (pBow12) {
        await api.bindProxyPool(pBow12.user_id, '46');
        console.log(`    ✓ Moved "${pBow12.name}" to Proxy 46`);
    }

    console.log('✅ Step 1: All 5 Proxies (6, 19, 20, 37, 50) are now completely FREE (0 profiles)!\n');

    // ── STEP 2: RE-ASSIGN TO THE 5 RECIPIENT TEAMS ──
    console.log('--- Step 2: Assigning the 5 Proxies to W, N, F, G, King ---');

    const REALLOCATION_PLAN = [
        {
            team: "Project W",
            prefix: "W",
            newProxyId: "37",
            donor: "Project Boy",
            targetProfiles: ["W 05", "W 10", "W 15"]
        },
        {
            team: "Project N",
            prefix: "N",
            newProxyId: "6",
            donor: "Project H",
            targetProfiles: ["N 05", "N 10", "N 15"]
        },
        {
            team: "Project F",
            prefix: "F",
            newProxyId: "20",
            donor: "Project Ton",
            targetProfiles: ["F 05", "F 10", "F 15"]
        },
        {
            team: "Project G",
            prefix: "G",
            newProxyId: "50",
            donor: "Project Bow",
            targetProfiles: ["G 05", "G 10", "G 15"]
        },
        {
            team: "Project King",
            prefix: "King",
            newProxyId: "19",
            donor: "Project Ton",
            targetProfiles: ["King 05", "King 10", "King 15"]
        }
    ];

    for (const plan of REALLOCATION_PLAN) {
        console.log(`\n▶ [${plan.team}] Assigning Proxy ${plan.newProxyId} (from ${plan.donor})...`);
        
        // 2A. Update Remark on Proxy
        const remarkText = `${plan.team} #05 (ย้ายจาก ${plan.donor})`;
        await api.updateProxy({ proxy_id: plan.newProxyId, remark: remarkText });
        console.log(`  ✓ Updated Proxy ${plan.newProxyId} remark -> "${remarkText}"`);
        await api.sleep(1300);

        // 2B. Re-bind target profiles (05, 10, 15) to newProxyId
        const teamProfs = await getProfiles(plan.team);
        await api.sleep(1300);

        for (const pName of plan.targetProfiles) {
            const p = teamProfs.find(x => x.name.trim() === pName.trim());
            if (p) {
                await api.bindProxyPool(p.user_id, plan.newProxyId);
                console.log(`  ✓ Re-bound "${pName}" (ID: ${p.user_id}) -> Proxy ${plan.newProxyId}`);
                await api.sleep(1300);
            } else {
                console.warn(`  ! Could not find profile "${pName}" in ${plan.team} (available: ${teamProfs.map(x=>x.name).join(', ')})`);
            }
        }
    }

    console.log('\n================================================================');
    console.log('🎉 [AutoLab] Re-Balancing Completed Successfully!');
    console.log('================================================================');
}

if (require.main === module) {
    rebalanceFleetProxies().catch(err => {
        console.error('[FATAL ERROR]:', err);
        process.exit(1);
    });
}

module.exports = { rebalanceFleetProxies };
