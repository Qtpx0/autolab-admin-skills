const { deleteCache, newFingerprint, listProfiles } = require('./api-client');

/**
 * Clean-Slate SOP (Section 15):
 * 1. Deep wipe: local_storage, indexeddb, cookie, history, image_file
 * 2. EXEMPT: extension_data (Preserves AutoLab extension config & tokens!)
 * 3. 1-Click New Fingerprint (Randomizes Canvas, WebGL, AudioContext, UserAgent)
 */
async function cleanSlate(profileQuery) {
    console.log(`[CleanSlate] Finding profile for query: "${profileQuery}"...`);
    const listRes = await listProfiles();
    const profiles = listRes.list || [];
    
    const target = profiles.find(p => 
        p.profile_id === profileQuery || 
        p.profile_no === profileQuery || 
        p.name.includes(profileQuery)
    );

    if (!target) {
        throw new Error(`Profile not found for query: ${profileQuery}`);
    }

    console.log(`[CleanSlate] Targeting Profile No: ${target.profile_no} (${target.name}) [ID: ${target.profile_id}]`);

    // Step 1: Deep Cache Wipe
    console.log('[CleanSlate] Step 1: Deep cache wipe (Exempting Extension Data)...');
    await deleteCache([target.profile_id]);
    console.log('[CleanSlate] Cache wiped clean 100%!');

    // Step 2: Randomize Fingerprint
    console.log('[CleanSlate] Step 2: Randomizing Canvas, WebGL, AudioContext, UserAgent...');
    await newFingerprint(target.profile_id);
    console.log('[CleanSlate] 🎲 New Fingerprint generated successfully!');

    console.log(`[CleanSlate] ✅ Profile "${target.name}" is now 100% clean and ready for a new Facebook account!`);
}

const targetArg = process.argv[2];
if (!targetArg) {
    console.log('Usage: node clean-slate-profile.js <profile_no | profile_id | profile_name>');
    process.exit(1);
}

cleanSlate(targetArg).catch(console.error);
