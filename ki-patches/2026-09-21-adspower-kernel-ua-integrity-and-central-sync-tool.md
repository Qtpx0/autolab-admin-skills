# KI Patch: AdsPower Kernel & User-Agent Integrity Standard & Universal Sync Tool

Patch ID: `autolab-adspower-kernel-ua-integrity-and-sync-2026-09-21`

Merge this finding into the existing `autolab_multi_account_adspower_proxy_architecture` KI. Do not replace or relocate the KI folder, remove existing SOPs, or apply this patch twice.

## Verified Findings & Architectural Invariants

### 1. BrowserScan WebGPU Version Mismatch Detection Mechanism
- **The Detection Vector:** Modern fraud detection engines (BrowserScan, Meta Risk Manager) do not rely solely on the HTTP `User-Agent` header. Instead, they execute WebGPU/WebGL API calls to measure GPU capabilities and internal Chromium feature flags.
- **Root Cause of Mismatch:**
  - AdsPower periodically updates its Chromium binaries (e.g. to SunBrowser Kernel 152).
  - To prevent sudden session drops or 2FA prompts on active Facebook logins, AdsPower intentionally freezes existing profiles' User-Agent strings to their creation-time values (e.g. Chrome 128–133).
  - When the engine runs Kernel 152 while the HTTP User-Agent claims Chrome 133 (> 3 major versions apart), BrowserScan triggers a high-severity red warning: *"Your browser version and User Agent do not match: The browser claims that Chrome 133, Detect version Chrome 152"*.

### 2. Zero-Loss Session Safety Invariant
- Updating a profile's User-Agent string via AdsPower Local API (`POST /api/v1/user/update`) does NOT clear SQLite cookies, IndexedDB, local storage, or saved passwords in `%USERDATA%\Default\Network\Cookies`.
- Facebook sessions remain 100% authenticated and intact while the discrepancy is eliminated.

### 3. Golden Fingerprint Standard Upgrade (`AUTOLAB_GOLDEN_FINGERPRINT`)
- In `scripts/api-client.js`, `random_ua` is updated to explicitly enforce the latest stable kernel:
  ```javascript
  random_ua: {
      ua_system_version: ['Windows 10', 'Windows 11'],
      ua_version: ['152']
  }
  ```
- This permanently prevents newly created profiles from inheriting legacy or obsolete Chrome UAs.

## Universal Automation Tooling: `sync-user-agents.js`

A centralized, multi-mode CLI utility is added to `.agents/skills/adspower-browser/scripts/sync-user-agents.js`:

```bash
# 1. Inspect fleet integrity (read-only audit):
npm run audit:user-agents
# Or: node .agents/skills/adspower-browser/scripts/sync-user-agents.js --audit

# 2. Fix a single profile by Serial Number or ID:
node .agents/skills/adspower-browser/scripts/sync-user-agents.js --serial 3
node .agents/skills/adspower-browser/scripts/sync-user-agents.js --id k1gfgthx

# 3. Fix an entire team group:
node .agents/skills/adspower-browser/scripts/sync-user-agents.js --group "Project Q"

# 4. Fleet-wide synchronization with randomized minor builds:
npm run sync:user-agents -- --all
```

### Key Features:
1. **Auto Kernel Detection:** Automatically inspects `%APPDATA%\adspower_global\cwd_global\chrome_*` to determine the highest installed kernel on the machine.
2. **Realistic Minor Build Rotation:** Avoids static strings by rotating official minor builds (e.g. `152.0.7977.54`, `152.0.7977.48`, `152.0.7977.60`, `152.0.7977.65`, `152.0.0.0`).
3. **Silent Background Execution:** Zero browser windows are launched during updates (100% headless HTTP API).
4. **Rate Limit Shield:** Enforces 1,400ms pause between updates to comply with AdsPower Local API write quotas.
