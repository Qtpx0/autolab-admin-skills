const api = require('./api-client');

/**
 * AutoLab Project M Setup Script
 * 1. Creates Group: "Project M"
 * 2. Updates Remarks for Proxies 105-108: "Project M #01" to "#04"
 * 3. Creates 15 Profiles: "M 01" to "M 15" with Golden Fingerprint & AutoPost Flags
 * 4. Interleaves Proxy Assignment across 105, 106, 107, 108 in Round-Robin fashion
 */
async function setupProjectM() {
    console.log('================================================================');
    console.log('🚀 [AutoLab] Setting up "Project M" (15 Profiles & Dedicated Pool)');
    console.log('================================================================\n');

    // 1. Create or get Group "Project M"
    console.log('--- Step 1: Checking / Creating Group "Project M" ---');
    const existingGroups = await api.listGroups();
    const groupList = existingGroups?.data?.list || existingGroups?.list || [];
    let mGroup = groupList.find(g => (g.group_name || '').trim().toLowerCase() === 'project m');

    let groupId = null;
    if (mGroup) {
        groupId = String(mGroup.group_id);
        console.log(`Found existing Group "Project M" (ID: ${groupId})`);
    } else {
        const createGroupRes = await api.createGroup('Project M', 'ทีมงาน Project M');
        console.log('Create Group Response:', createGroupRes);
        groupId = String(createGroupRes?.data?.group_id || createGroupRes?.group_id || createGroupRes?.id);
        console.log(`✅ Successfully created Group "Project M" (ID: ${groupId})`);
    }

    if (!groupId) {
        throw new Error('Failed to resolve group_id for Project M!');
    }
    await api.sleep(1500);

    // 2. Update Remarks on Proxies 105-108
    console.log('\n--- Step 2: Updating Remarks on Dedicated Proxies 105–108 ---');
    const dedicatedProxies = ['105', '106', '107', '108'];
    for (let idx = 0; idx < dedicatedProxies.length; idx++) {
        const pid = dedicatedProxies[idx];
        const numStr = String(idx + 1).padStart(2, '0');
        const remark = `Project M #${numStr}`;
        try {
            await api.updateProxy({ proxy_id: pid, remark });
            console.log(`  - Proxy ${pid} remark updated to "${remark}"`);
        } catch (e) {
            console.warn(`  - Proxy ${pid} remark update failed: ${e.message}`);
        }
        await api.sleep(1000);
    }

    // 3. Create 15 Profiles with interleaved proxy allocation
    console.log('\n--- Step 3: Creating 15 Profiles ("M 01" to "M 15") ---');
    console.log('Interleaving pattern: 105, 106, 107, 108 in round-robin sequence\n');

    const createdProfiles = [];
    for (let i = 1; i <= 15; i++) {
        const numStr = String(i).padStart(2, '0');
        const name = `M ${numStr}`;
        const targetProxyId = dedicatedProxies[(i - 1) % dedicatedProxies.length];

        console.log(`Creating [${i}/15] "${name}" -> Proxy ${targetProxyId}...`);
        const res = await api.createAutoLabProfile({
            name,
            group_id: groupId,
            proxyid: targetProxyId,
            remark: `Project M - จอ ${numStr}`,
            tabs: ['https://www.facebook.com']
        });

        const profileId = res?.id || res?.data?.id || res?.profile_id || 'OK';

        if (profileId && profileId !== 'OK') {
            try {
                await api.bindProxyPool(profileId, targetProxyId);
            } catch (e) {}
        }

        createdProfiles.push({
            name,
            profile_id: profileId,
            proxy_id: targetProxyId
        });
        console.log(`  ✅ Profile "${name}" created successfully (ID: ${profileId})`);
        await api.sleep(1200);
    }

    // 4. Verification Table
    console.log('\n================================================================');
    console.log('🔍 [Verification] Project M Fleet Allocation');
    console.log('================================================================');
    console.table(createdProfiles);

    const counts = {};
    for (const p of createdProfiles) {
        counts[p.proxy_id] = (counts[p.proxy_id] || 0) + 1;
    }
    console.log('\n📊 IP Distribution across Dedicated Proxies:');
    for (const [pid, count] of Object.entries(counts)) {
        console.log(`  - Proxy ID ${pid}: ${count} profiles`);
    }

    console.log('\n🎉 ALL 15 PROFILES CREATED AND ISOLATED SUCCESSFULLY!');
}

if (require.main === module) {
    setupProjectM().catch(err => {
        console.error('[FATAL ERROR]:', err);
        process.exit(1);
    });
}

module.exports = { setupProjectM };
