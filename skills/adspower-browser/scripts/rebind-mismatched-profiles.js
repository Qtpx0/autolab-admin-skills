const api = require('./api-client');
const { verifyUpstreamSync } = require('./admin-kit-core');

/**
 * AutoLab Fleet Proxy Clean-up & Isolation Script
 * Re-binds all 10 legacy mismatched profiles from Project H and Project S
 * back into their dedicated 5-proxy pools.
 */
async function rebindMismatchedProfiles() {
    await verifyUpstreamSync();
    console.log('================================================================');
    console.log('🧹 [AutoLab] Re-binding Mismatched Profiles to Dedicated Pools');
    console.log('🎯 Targets: Project H (6 profiles) & Project S (4 profiles)');
    console.log('================================================================\n');

    // 1. Group IDs
    const groupsRes = await api.listGroups();
    const groups = groupsRes.list || [];
    const gH = groups.find(g => g.group_name === 'Project H');
    const gS = groups.find(g => g.group_name === 'Project S');

    if (!gH || !gS) {
        throw new Error('Project H or Project S group not found!');
    }

    // ─────────────────────────────────────────────────────────────
    // PART 1: RE-BIND PROJECT H (6 Profiles) -> Dedicated: 7, 8, 10, 11, 12
    // ─────────────────────────────────────────────────────────────
    console.log(`▶ [Part 1/2] Processing Project H (Group ID: ${gH.group_id})...`);
    await api.sleep(1400);
    const profsH = await api.listProfiles({ group_id: gH.group_id, page_size: 100 });
    const listH = profsH.list || [];

    const hMoves = [
        { serial: '34', targetProxy: '8', desc: '12 หนังชนโรง V.2 (ย้ายจาก P6 -> P8)' },
        { serial: '30', targetProxy: '8', desc: '02 หนังนอกโรง (ย้ายจาก P45 -> P8)' },
        { serial: '29', targetProxy: '11', desc: '03 โกสป่ะ (ย้ายจาก P23 -> P11)' },
        { serial: '24', targetProxy: '11', desc: '07 ฟิล์มหลอนชวนดู (ย้ายจาก P5 -> P11)' },
        { serial: '23', targetProxy: '7', desc: '08 ชอบดูหนัง (ย้ายจาก P42 -> P7)' },
        { serial: '22', targetProxy: '7', desc: '16 หนังนอกโรง (ย้ายจาก P37 -> P7)' }
    ];

    for (let i = 0; i < hMoves.length; i++) {
        const m = hMoves[i];
        const p = listH.find(x => x.serial_number === m.serial);
        if (!p) {
            console.warn(`  ⚠️ Profile serial ${m.serial} not found in Project H`);
            continue;
        }

        console.log(`  [${i + 1}/${hMoves.length}] Moving "${p.name}" (Serial: ${m.serial}) -> Proxy ${m.targetProxy}...`);
        await api.bindProxyPool(p.user_id, m.targetProxy);
        console.log(`    ✓ Successfully bound to Proxy ${m.targetProxy}`);
        await api.sleep(1400); // Strict Rate Limit Guard
    }

    // ─────────────────────────────────────────────────────────────
    // PART 2: RE-BIND PROJECT S (4 Profiles) -> Dedicated: 13, 25, 26, 27, 28
    // ─────────────────────────────────────────────────────────────
    console.log(`\n▶ [Part 2/2] Processing Project S (Group ID: ${gS.group_id})...`);
    const profsS = await api.listProfiles({ group_id: gS.group_id, page_size: 100 });
    const listS = profsS.list || [];

    const sMoves = [
        { serial: '169', targetProxy: '25', desc: '01 โรงเรียนหลอน (ย้ายจาก P7 -> P25)' },
        { serial: '168', targetProxy: '25', desc: '12 คืนเดือนดับ (ย้ายจาก P59 -> P25)' },
        { serial: '161', targetProxy: '28', desc: '09 สนุกซีรี่ส์ (ย้ายจาก P22 -> P28)' },
        { serial: '158', targetProxy: '28', desc: '03หนังวันวาน (ย้ายจาก P15 -> P28)' },
        { serial: '171', targetProxy: '26', desc: 'Admin Sucha (ย้ายจาก P27 -> P26 เกลี่ยให้เท่ากัน 3-3-3-3-3)' }
    ];

    for (let i = 0; i < sMoves.length; i++) {
        const m = sMoves[i];
        const p = listS.find(x => x.serial_number === m.serial);
        if (!p) {
            console.warn(`  ⚠️ Profile serial ${m.serial} not found in Project S`);
            continue;
        }

        console.log(`  [${i + 1}/${sMoves.length}] Moving "${p.name}" (Serial: ${m.serial}) -> Proxy ${m.targetProxy}...`);
        await api.bindProxyPool(p.user_id, m.targetProxy);
        console.log(`    ✓ Successfully bound to Proxy ${m.targetProxy}`);
        await api.sleep(1400); // Strict Rate Limit Guard
    }

    // ─────────────────────────────────────────────────────────────
    // VERIFICATION: Check Project H and Project S distribution
    // ─────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log('🔍 [Verification] Checking Final Status of H and S');
    console.log('================================================================');

    await api.sleep(1400);
    const verifyH = await api.listProfiles({ group_id: gH.group_id, page_size: 100 });
    const countH = {};
    (verifyH.list || []).forEach(p => {
        const pid = p.fbcc_proxy_acc_id || 'none';
        countH[pid] = (countH[pid] || 0) + 1;
    });
    console.log('Project H Proxies in Use:', Object.entries(countH).map(([id, c]) => `Proxy ${id}: ${c} จอ`).join(', '));

    await api.sleep(1400);
    const verifyS = await api.listProfiles({ group_id: gS.group_id, page_size: 100 });
    const countS = {};
    (verifyS.list || []).forEach(p => {
        const pid = p.fbcc_proxy_acc_id || 'none';
        countS[pid] = (countS[pid] || 0) + 1;
    });
    console.log('Project S Proxies in Use:', Object.entries(countS).map(([id, c]) => `Proxy ${id}: ${c} จอ`).join(', '));

    console.log('\n🎉 Re-binding and Isolation Completed Successfully!');
}

if (require.main === module) {
    rebindMismatchedProfiles().catch(err => {
        console.error('[FATAL ERROR]:', err);
        process.exit(1);
    });
}

module.exports = { rebindMismatchedProfiles };
