const path = require('path');
const api = require('./api-client');

async function provisionProject(projectName, count = 15, customRemark = '') {
    if (!projectName) {
        console.error('Usage: node provision-project.js <ProjectName> [count=15] [remark]');
        process.exit(1);
    }

    const remark = customRemark || `AutoLab Agency Fleet - ${projectName}`;
    console.log(`\n=== AutoLab Fleet Provisioning: "${projectName}" (${count} Profiles) ===`);

    // 1. Group Resolution
    console.log(`[1/4] Checking/Creating Group "${projectName}"...`);
    const existingGroups = await api.listGroups();
    let group = (existingGroups.list || []).find(g => g.group_name.toLowerCase() === projectName.toLowerCase());

    if (group) {
        console.log(` -> Existing Group found: ${group.group_name} (ID: ${group.group_id})`);
    } else {
        console.log(` -> Creating new group "${projectName}"...`);
        await api.createGroup(projectName, remark);
        await api.sleep(1500);

        const updatedGroups = await api.listGroups();
        group = (updatedGroups.list || []).find(g => g.group_name.toLowerCase() === projectName.toLowerCase());
        if (!group) throw new Error(`Failed to find newly created group: "${projectName}"`);
        console.log(` -> Created Group successfully! (ID: ${group.group_id})`);
    }

    const groupId = group.group_id;

    // 2. Proxy Allocation
    console.log(`\n[2/4] Resolving Proxy Pool for "${projectName}"...`);
    const proxiesRes = await api.listProxies(1, 100);
    const allProxies = proxiesRes.list || [];

    // Search for tagged proxies first
    let matchedProxies = allProxies.filter(p => 
        (p.proxy_tags || []).some(t => t.name.toLowerCase().includes(projectName.toLowerCase()))
    );

    if (matchedProxies.length === 0) {
        console.log(` -> No dedicated proxies tagged "${projectName}". Searching for free proxies...`);
        matchedProxies = allProxies.filter(p => 
            (p.proxy_tags || []).some(t => t.name.includes('ว่าง')) || Number(p.profile_count || 0) === 0
        );
    }

    if (matchedProxies.length === 0) {
        throw new Error(`No available or tagged proxies found in pool for "${projectName}"`);
    }

    console.log(` -> Using ${matchedProxies.length} proxies for round-robin binding:`);
    matchedProxies.forEach(p => console.log(`    • Proxy ID: ${p.proxy_id} (${p.host}:${p.port})`));

    const proxyIds = matchedProxies.map(p => p.proxy_id);

    // 3. Profile Generation (Golden Fingerprint Standard)
    console.log(`\n[3/4] Generating ${count} Profiles under Golden Fingerprint Standard...`);
    const createdList = [];
    const prefix = projectName.replace(/^Project\s+/i, '');

    for (let i = 1; i <= count; i++) {
        const numStr = String(i).padStart(2, '0');
        const profileName = `${prefix} ${numStr}`;
        const proxyId = proxyIds[(i - 1) % proxyIds.length];

        console.log(` [${i}/${count}] Creating "${profileName}" (Proxy ID: ${proxyId})...`);

        try {
            const res = await api.createAutoLabProfile({
                name: profileName,
                group_id: groupId,
                proxyid: proxyId,
                remark: projectName,
                tabs: ['https://facebook.com']
            });

            const createdId = res?.id || res?.data?.id || res?.profile_id;
            console.log(`   -> Created! ID: ${createdId}`);

            if (createdId) {
                try {
                    await api.bindProxyPool(createdId, proxyId);
                } catch (e) {}
            }

            createdList.push({ name: profileName, id: createdId, proxyId });
        } catch (err) {
            console.error(`   -> Failed to create "${profileName}": ${err.message}`);
        }

        await api.sleep(500);
    }

    // 4. Verification
    console.log(`\n[4/4] Verifying Provisioned Fleet...`);
    const verifyProfiles = await api.listProfiles({ group_id: groupId, page_size: 100 });
    const currentInGroup = verifyProfiles.list || [];
    console.log(`Group "${projectName}" now contains ${currentInGroup.length} profiles.`);

    console.log('\n=== PROVISIONING COMPLETED ===');
    console.log(`Created: ${createdList.length}/${count} profiles in Group "${projectName}" (ID: ${groupId})`);
    return { groupId, createdList, total: currentInGroup.length };
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const proj = args[0];
    const cnt = parseInt(args[1] || '15', 10);
    const rmk = args[2] || '';
    provisionProject(proj, cnt, rmk).catch(err => {
        console.error('\n[Provisioning Error]:', err.message);
        process.exit(1);
    });
}

module.exports = { provisionProject };
