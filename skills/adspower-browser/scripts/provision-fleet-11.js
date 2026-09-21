const api = require('./api-client');
const { verifyUpstreamSync } = require('./admin-kit-core');

const FLEET_ALLOCATION = [
    { name: "Project Aorra", prefix: "Aorra", proxyIds: ["51", "52", "53", "54", "55"] },
    { name: "Project Carry", prefix: "Carry", proxyIds: ["56", "57", "58", "59", "60"] },
    { name: "Project Game", prefix: "Game", proxyIds: ["61", "62", "63", "64", "65"] },
    { name: "Project Jes", prefix: "Jes", proxyIds: ["66", "67", "68", "69", "70"] },
    { name: "Project NiNew", prefix: "NiNew", proxyIds: ["71", "72", "73", "74", "75"] },
    { name: "Project Sky", prefix: "Sky", proxyIds: ["76", "77", "78", "79", "80"] },
    { name: "Project W", prefix: "W", proxyIds: ["81", "82", "83", "84"] },
    { name: "Project N", prefix: "N", proxyIds: ["85", "86", "87", "88"] },
    { name: "Project F", prefix: "F", proxyIds: ["89", "90", "91", "92"] },
    { name: "Project G", prefix: "G", proxyIds: ["93", "94", "95", "96"] },
    { name: "Project King", prefix: "King", proxyIds: ["97", "98", "99", "100"] }
];

const PROFILES_PER_EMPLOYEE = 15;

async function runFleetProvisioning() {
    await verifyUpstreamSync();
    console.log('================================================================');
    console.log('🚀 [AutoLab] Starting Fleet Provisioning for 11 Employees');
    console.log(`📋 Total: 11 Teams x ${PROFILES_PER_EMPLOYEE} Profiles = ${11 * PROFILES_PER_EMPLOYEE} Profiles`);
    console.log('🌐 Proxy Pool: ID 51 to 100 (50 Proxies)');
    console.log('================================================================\n');

    // ── Phase 1: Annotate Proxy Pool Remarks ──
    console.log('--- Phase 1: Updating Remarks on Proxy ID 51–100 ---');
    for (const team of FLEET_ALLOCATION) {
        for (let i = 0; i < team.proxyIds.length; i++) {
            const pId = team.proxyIds[i];
            const remarkText = `${team.name} #${String(i + 1).padStart(2, '0')}`;
            try {
                await api.updateProxy({ proxy_id: pId, remark: remarkText });
                console.log(`  ✓ Proxy ${pId.padStart(3, ' ')} -> remark: "${remarkText}"`);
            } catch (e) {
                console.error(`  ✗ Proxy ${pId} failed to update remark:`, e.message);
            }
            await api.sleep(250);
        }
    }
    console.log('✅ Phase 1: Proxy Remarks updated successfully.\n');

    // ── Phase 2: Resolve / Create Groups in AdsPower ──
    console.log('--- Phase 2: Resolving & Creating Groups ---');
    const existingGroupsRes = await api.listGroups();
    const existingGroups = existingGroupsRes.list || [];
    const groupMap = new Map();

    for (const g of existingGroups) {
        groupMap.set(g.group_name.toLowerCase().trim(), g.group_id);
    }

    for (const team of FLEET_ALLOCATION) {
        const key = team.name.toLowerCase().trim();
        if (groupMap.has(key)) {
            team.groupId = groupMap.get(key);
            console.log(`  ✓ Group exists: "${team.name}" (ID: ${team.groupId})`);
        } else {
            console.log(`  + Creating new group: "${team.name}"...`);
            await api.createGroup(team.name, `AutoLab Agency Fleet - ${team.name}`);
            await api.sleep(1300);
            const refreshed = await api.listGroups();
            const found = (refreshed.list || []).find(g => g.group_name.toLowerCase().trim() === key);
            if (!found) throw new Error(`Failed to resolve created group: "${team.name}"`);
            team.groupId = found.group_id;
            groupMap.set(key, found.group_id);
            console.log(`  ✓ Group created: "${team.name}" (ID: ${team.groupId})`);
        }
    }
    console.log('✅ Phase 2: All 11 Groups ready.\n');

    // ── Phase 3: Create Profiles (AutoLab Golden Fingerprint) ──
    console.log(`--- Phase 3: Provisioning ${11 * PROFILES_PER_EMPLOYEE} Profiles with Golden Fingerprint Standard ---`);
    const totalToCreate = FLEET_ALLOCATION.length * PROFILES_PER_EMPLOYEE;
    let globalIndex = 0;
    const summaryStats = [];

    for (const team of FLEET_ALLOCATION) {
        console.log(`\n▶ [${team.name}] Starting ${PROFILES_PER_EMPLOYEE} Profiles (Proxies: ${team.proxyIds.join(', ')})...`);
        let successCount = 0;

        for (let i = 1; i <= PROFILES_PER_EMPLOYEE; i++) {
            globalIndex++;
            const numStr = String(i).padStart(2, '0');
            const profileName = `${team.prefix} ${numStr}`;
            const assignedProxyId = team.proxyIds[(i - 1) % team.proxyIds.length];

            process.stdout.write(` [${globalIndex}/${totalToCreate}] Creating "${profileName}" (Proxy: ${assignedProxyId})... `);

            try {
                const res = await api.createAutoLabProfile({
                    name: profileName,
                    group_id: team.groupId,
                    proxyid: assignedProxyId,
                    remark: team.name,
                    tabs: ['https://facebook.com']
                });

                const createdId = res?.id || res?.data?.id || res?.profile_id;
                if (createdId) {
                    try {
                        await api.bindProxyPool(createdId, assignedProxyId);
                    } catch (e) {}
                    successCount++;
                    console.log(`DONE (ID: ${createdId})`);
                } else {
                    console.log(`WARN (No profile ID returned: ${JSON.stringify(res)})`);
                }
            } catch (err) {
                console.log(`FAILED: ${err.message}`);
            }

            // api.createAutoLabProfile already includes 1300ms sleep
        }

        summaryStats.push({ team: team.name, created: successCount, target: PROFILES_PER_EMPLOYEE });
    }

    // ── Phase 4: Final Fleet Verification ──
    console.log('\n================================================================');
    console.log('📊 [AutoLab] Final Verification Summary');
    console.log('================================================================');
    summaryStats.forEach(s => {
        console.log(`  • ${s.team.padEnd(16, ' ')} : ${s.created}/${s.target} profiles`);
    });

    const allProfilesRes = await api.listProfiles({ page: 1, page_size: 10 });
    console.log(`\n🎉 Fleet Provisioning Complete!`);
    console.log(`📌 Total profiles in AdsPower now: ~${142 + totalToCreate}`);
}

if (require.main === module) {
    runFleetProvisioning().catch(err => {
        console.error('\n[FATAL ERROR]:', err);
        process.exit(1);
    });
}

module.exports = { runFleetProvisioning, FLEET_ALLOCATION };
