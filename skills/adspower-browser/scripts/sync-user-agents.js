/**
 * AutoLab Universal AdsPower User-Agent & Kernel Integrity Sync Tool
 * 
 * Capabilities:
 *  1. Auto-detects installed SunBrowser kernels on the local machine (e.g. Chrome 152).
 *  2. Generates realistic, randomized minor builds within the target major version branch.
 *  3. Supports flexible target scopes:
 *       --audit                 : Read-only inspection and status report
 *       --all                   : Sync entire fleet across all groups
 *       --outdated-only         : Sync profiles created before target kernel era (default for fleet sync)
 *       --serial <N>            : Sync single profile by Serial Number (e.g. --serial 3)
 *       --id <user_id>          : Sync single profile by AdsPower Profile ID
 *       --group <Name>          : Sync all profiles in a specific group (e.g. --group "Project Q")
 *       --kernel <version>      : Override target major version (defaults to highest installed, e.g. 152)
 *       --dry-run               : Preview updates without calling the API
 *       --rate-limit <ms>       : API delay between requests (default: 1400ms)
 */

const fs = require('fs');
const path = require('path');
const api = require('./api-client');

const KNOWN_MINOR_BUILDS = {
    '152': [
        '152.0.7977.54',
        '152.0.7977.48',
        '152.0.7977.51',
        '152.0.7977.60',
        '152.0.7977.65',
        '152.0.0.0'
    ],
    '150': [
        '150.0.7871.47',
        '150.0.7871.40',
        '150.0.7871.50',
        '150.0.0.0'
    ]
};

function getInstalledKernels() {
    try {
        const cwdGlobal = path.join(process.env.APPDATA || '', 'adspower_global', 'cwd_global');
        if (fs.existsSync(cwdGlobal)) {
            const entries = fs.readdirSync(cwdGlobal, { withFileTypes: true });
            const kernels = [];
            for (const ent of entries) {
                if (ent.isDirectory() && ent.name.startsWith('chrome_')) {
                    kernels.push(ent.name.replace('chrome_', ''));
                }
            }
            if (kernels.length > 0) {
                return kernels.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
            }
        }
    } catch (e) {}
    return ['152'];
}

function generateRealisticUA(majorVer = '152') {
    const builds = KNOWN_MINOR_BUILDS[majorVer] || [`${majorVer}.0.0.0`];
    const build = builds[Math.floor(Math.random() * builds.length)];
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${build} Safari/537.36`;
}

function parseCliArgs() {
    const args = process.argv.slice(2);
    const options = {
        mode: 'help',
        targetKernel: null,
        serial: null,
        id: null,
        group: null,
        dryRun: false,
        rateLimit: 1400
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--audit' || arg === '-a') {
            options.mode = 'audit';
        } else if (arg === '--all') {
            options.mode = 'all';
        } else if (arg === '--outdated-only') {
            options.mode = 'outdated';
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--serial' || arg === '--sn') {
            options.serial = args[++i];
            options.mode = 'single';
        } else if (arg === '--id' || arg === '--user-id') {
            options.id = args[++i];
            options.mode = 'single';
        } else if (arg === '--group' || arg === '-g') {
            options.group = args[++i];
            options.mode = 'group';
        } else if (arg === '--kernel' || arg === '-k') {
            options.targetKernel = args[++i];
        } else if (arg === '--rate-limit') {
            options.rateLimit = parseInt(args[++i], 10) || 1400;
        } else if (arg === '--help' || arg === '-h') {
            options.mode = 'help';
        }
    }

    if (!options.targetKernel) {
        const installed = getInstalledKernels();
        options.targetKernel = installed[0] || '152';
    }

    return options;
}

function printHelp() {
    console.log(`
AutoLab Universal User-Agent & Kernel Integrity Sync Tool

Usage:
  node sync-user-agents.js [options]

Modes:
  --audit                 Inspect all profiles and report Kernel / UA status
  --all                   Sync all profiles across the entire fleet
  --outdated-only         Sync only profiles created before target kernel era (default)
  --group <Name>          Sync all profiles in a specific group (e.g. --group "Project Q")
  --serial <N>            Sync single profile by Serial Number (e.g. --serial 3)
  --id <profileId>        Sync single profile by AdsPower Profile ID

Options:
  --kernel <version>      Target Chrome major version (default: auto-detected, currently ${getInstalledKernels()[0] || '152'})
  --dry-run               Preview planned changes without writing to AdsPower API
  --rate-limit <ms>       Delay between API requests (default: 1400ms)
  --help                  Show this help message

Examples:
  node sync-user-agents.js --audit
  node sync-user-agents.js --serial 3
  node sync-user-agents.js --group "Project Com"
  node sync-user-agents.js --all --dry-run
`);
}

async function fetchAllProfiles() {
    const profiles = [];
    let page = 1;
    while (true) {
        const res = await api.listProfiles({ page, page_size: 100 });
        const list = res.list || [];
        if (list.length === 0) break;
        profiles.push(...list);
        if (list.length < 100) break;
        await api.sleep(1300);
        page++;
    }
    return profiles;
}

async function main() {
    const opts = parseCliArgs();

    if (opts.mode === 'help') {
        printHelp();
        return;
    }

    console.log('================================================================');
    console.log('🛡️  [AutoLab] Universal User-Agent & Kernel Integrity Manager');
    console.log(`🎯 Active Target Kernel: Chrome ${opts.targetKernel}`);
    console.log(`⏱️  API Rate Limit Guard: ${opts.rateLimit}ms`);
    if (opts.dryRun) console.log('🔍 DRY-RUN MODE: No changes will be applied.');
    console.log('================================================================\n');

    // 1. Audit Mode
    if (opts.mode === 'audit') {
        console.log('🔍 Fetching all profiles from AdsPower Local API...');
        const all = await fetchAllProfiles();
        console.log(`📊 Total Profiles Found: ${all.length}\n`);

        const sep2Timestamp = Math.floor(new Date('2026-09-02T00:00:00Z').getTime() / 1000);
        let outdatedCount = 0;
        let modernCount = 0;
        const groupStats = {};

        for (const p of all) {
            const grp = p.group_name || 'No Group';
            if (!groupStats[grp]) groupStats[grp] = { total: 0, outdated: 0 };
            groupStats[grp].total++;

            const ct = parseInt(p.created_time, 10);
            if (ct < sep2Timestamp) {
                outdatedCount++;
                groupStats[grp].outdated++;
            } else {
                modernCount++;
            }
        }

        console.log('--- Group Integrity Breakdown ---');
        for (const [grp, stat] of Object.entries(groupStats)) {
            const statusBadge = stat.outdated > 0 ? `⚠️  ${stat.outdated} Outdated` : '✅ All Modern';
            console.log(`  • ${grp.padEnd(16, ' ')} : ${String(stat.total).padStart(2, ' ')} profiles [${statusBadge}]`);
        }

        console.log('\n================================================================');
        console.log(`📋 Summary: ${modernCount} Modern (Chrome ${opts.targetKernel}), ${outdatedCount} Pre-Sep2 Profiles`);
        console.log('================================================================');
        return;
    }

    // 2. Resolve Targets for Sync
    let targets = [];
    if (opts.mode === 'single') {
        if (opts.serial) {
            console.log(`🔍 Resolving profile with Serial Number: #${opts.serial}...`);
            const res = await api.listProfiles({ serial_number: String(opts.serial) });
            targets = res.list || [];
        } else if (opts.id) {
            console.log(`🔍 Resolving profile with ID: ${opts.id}...`);
            const res = await api.listProfiles({ user_id: opts.id });
            targets = res.list || [];
        }
    } else if (opts.mode === 'group') {
        console.log(`🔍 Resolving profiles in Group: "${opts.group}"...`);
        const all = await fetchAllProfiles();
        targets = all.filter(p => p.group_name && p.group_name.toLowerCase().includes(opts.group.toLowerCase()));
    } else if (opts.mode === 'all') {
        console.log('🔍 Fetching all profiles across the entire fleet...');
        targets = await fetchAllProfiles();
    } else if (opts.mode === 'outdated') {
        console.log('🔍 Fetching all pre-Sep2 outdated profiles across the fleet...');
        const all = await fetchAllProfiles();
        const sep2 = Math.floor(new Date('2026-09-02T00:00:00Z').getTime() / 1000);
        targets = all.filter(p => parseInt(p.created_time, 10) < sep2);
    }

    if (targets.length === 0) {
        console.log('⚠️  No matching profiles found for the given criteria.');
        return;
    }

    console.log(`📋 Matched ${targets.length} profile(s) to synchronize.\n`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targets.length; i++) {
        const p = targets[i];
        const newUA = generateRealisticUA(opts.targetKernel);
        const indexStr = `[${i + 1}/${targets.length}]`;
        const snStr = p.serial_number ? `Serial #${String(p.serial_number).padStart(2, ' ')}` : 'ID ' + p.user_id;

        if (opts.dryRun) {
            console.log(`  [DRY-RUN] ${indexStr} ${snStr} | ${(p.group_name || '').padEnd(12, ' ')} | "${p.name}" -> ${newUA}`);
            successCount++;
            continue;
        }

        try {
            await api.updateProfile({
                user_id: p.user_id,
                fingerprint_config: {
                    ua: newUA
                }
            });
            console.log(`  ✓ ${indexStr} ${snStr} | ${(p.group_name || '').padEnd(12, ' ')} | "${p.name}" -> ${newUA}`);
            successCount++;
        } catch (err) {
            console.error(`  ✗ ${indexStr} ${snStr} | "${p.name}" failed: ${err.message}`);
            failCount++;
        }

        if (i < targets.length - 1) {
            await api.sleep(opts.rateLimit);
        }
    }

    console.log('\n================================================================');
    console.log(`🎉 Sync Completed: ${successCount} Successful, ${failCount} Failed`);
    console.log('================================================================');
}

if (require.main === module) {
    main().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

module.exports = {
    getInstalledKernels,
    generateRealisticUA
};
