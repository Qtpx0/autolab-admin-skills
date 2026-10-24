const api = require('./api-client');
const { verifyUpstreamSync } = require('./admin-kit-core');

/**
 * AutoLab Fleet Proxy Integrity & Isolation Audit Tool
 * Audits all 308 profiles across all 20 groups to ensure 0 cross-team proxy leaks.
 */
async function fullFleetAudit() {
    await verifyUpstreamSync();
    console.log('================================================================');
    console.log('🔍 [AutoLab] 360-Degree Fleet Proxy Integrity & Isolation Audit');
    console.log('================================================================\n');
    
    // 1. Fetch all proxies and map each proxy to its owning team (by proxy_tags or remark)
    const p1 = await api.listProxies(1, 100);
    await api.sleep(1000);
    const p2 = await api.listProxies(2, 100);
    const allProxies = [...(p1.list || []), ...(p2.list || [])];

    const proxyOwnerMap = {};
    allProxies.forEach(p => {
        let tag = (p.proxy_tags && p.proxy_tags[0] && p.proxy_tags[0].name) || '';
        if (!tag && p.remark) {
            const m = p.remark.match(/(Project\s+[A-Za-z0-9]+)/i);
            if (m) tag = m[1];
        }
        proxyOwnerMap[p.proxy_id] = tag.trim();
    });

    // 2. Fetch all groups
    const groupsRes = await api.listGroups();
    const groups = groupsRes.list || [];

    console.log(`Auditing all ${groups.length} groups across fleet...\n`);

    const mismatchedProfiles = [];
    const teamStats = [];

    for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        await api.sleep(1400); // Strict Rate Limit Guard
        const profRes = await api.listProfiles({ group_id: g.group_id, page_size: 100 });
        const profs = profRes.list || [];

        let internalCount = 0;
        let externalCount = 0;

        profs.forEach(p => {
            const pid = p.fbcc_proxy_acc_id || (p.user_proxy_config && p.user_proxy_config.proxy_id);
            const proxyOwner = proxyOwnerMap[pid] || 'Unknown';

            const normG = g.group_name.toLowerCase().replace(/\s+/g, '');
            const normO = proxyOwner.toLowerCase().replace(/\s+/g, '');

            const isMatch = normG === normO || 
                            (normG.includes('aor') && normO.includes('aor')) ||
                            (normG.includes('ninew') && normO.includes('ninew'));

            if (isMatch) {
                internalCount++;
            } else {
                externalCount++;
                mismatchedProfiles.push({
                    team: g.group_name,
                    serial: p.serial_number,
                    name: p.name,
                    boundProxyId: pid,
                    actualProxyOwner: proxyOwner
                });
            }
        });

        teamStats.push({
            Team: g.group_name,
            Total: profs.length,
            'Own Proxy': internalCount,
            'Mismatched (External)': externalCount,
            Status: externalCount === 0 ? '🟢 100% Clean' : `🔴 ${externalCount} Mismatched`
        });
    }

    console.table(teamStats);

    console.log('\n================================================================');
    if (mismatchedProfiles.length === 0) {
        console.log('✅ ALL FLEET PROFILES ARE 100% ISOLATED (0 Mismatched Profiles)');
    } else {
        console.log(`🚨 TOTAL MISMATCHED PROFILES FOUND IN FLEET: ${mismatchedProfiles.length}`);
        console.table(mismatchedProfiles);
    }
    console.log('================================================================\n');

    return { totalMismatched: mismatchedProfiles.length, teamStats };
}

if (require.main === module) {
    fullFleetAudit().catch(err => {
        console.error('[FATAL AUDIT ERROR]:', err);
        process.exit(1);
    });
}

module.exports = { fullFleetAudit };
