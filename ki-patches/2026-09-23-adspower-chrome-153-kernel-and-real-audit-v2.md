# KI Patch: AdsPower SunBrowser Chrome 153 Kernel Upgrade, Real Audit Mode & Before/After Verification Guard

Patch ID: `autolab-adspower-chrome-153-kernel-real-audit-2026-09-23`

Merge this finding into the existing `autolab_multi_account_adspower_proxy_architecture` KI. Do not replace or relocate the KI folder, remove existing SOPs, or apply this patch twice.

## 1. Verified Findings & Architectural Invariants

### 1.1 SunBrowser Chrome 153 Engine & Native Minor Build Rotation
- **AdsPower Chromium Engine Upgrade:** AdsPower downloaded and activated Chromium 153 (SunBrowser 153). Existing profiles created before the update remain frozen on legacy kernels (Chrome 128–152), causing potential WebGPU / WebGL feature drift against HTTP User-Agent headers.
- **Native Minor Build Branches:**
  - SunBrowser native 153 branch builds: `153.0.8010.36`, `153.0.8010.37`, `153.0.8010.40`, `153.0.8010.42`.
  - Chromium official release builds: `153.0.7977.48`, `153.0.7977.51`, `153.0.7977.54`, `153.0.7977.60`, `153.0.7977.65`.
  - Realistic rotation ensures that 308 profiles do not share identical static strings, simulating authentic individual user PCs.

### 1.2 Dual-Fingerprint Atomic Update Payload
- Updating via AdsPower Local API must send both `browser_kernel_config` and `ua` inside `fingerprint_config`:
  ```json
  {
    "user_id": "<profile_id>",
    "fingerprint_config": {
      "browser_kernel_config": {
        "type": "chrome",
        "version": "153"
      },
      "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.37 Safari/537.36"
    }
  }
  ```
- **Zero-Loss Guarantee:** Cookies, saved passwords, Facebook auth tokens, and proxy IP bindings remain 100% untouched.

### 1.3 Real Audit Mode via Batch UA Endpoint
- The endpoint `POST /api/v2/browser-profile/ua` accepts batch queries of up to 10 profiles (`profile_no: ['1', '2', ...]`).
- Inspects ground-truth HTTP UA strings and parses the active major kernel version directly from AdsPower without guessing creation dates.
- Output organizes profiles by Team / Project group, indicating profile serial numbers, names, current versions, and outdated status.

### 1.4 Before & After Verification Pass
- In Sync Mode, the tool captures an initial snapshot of all target profiles.
- Post-update, it performs an automated re-query against `/api/v2/browser-profile/ua` to assert 100% transition fidelity.
- Generates a consolidated transition report (e.g. `Chrome 150: 29 -> 0`, `Chrome 152: 115 -> 0`, `Chrome 153: 77 -> 308`).

---

## 2. Universal Automation Tooling Commands

```bash
# 1. Real Audit Mode (Fleet-wide status with per-group breakdown):
npm run adspower:audit-kernel
# Or: node .agents/skills/adspower-browser/scripts/sync-user-agents.js --audit

# 2. Sync Entire Fleet to Latest Downloaded Kernel (Chrome 153):
npm run adspower:sync-kernel -- --all
# Or: node .agents/skills/adspower-browser/scripts/sync-user-agents.js --all

# 3. Sync a Specific Group:
node .agents/skills/adspower-browser/scripts/sync-user-agents.js --group "Project F"

# 4. Sync a Single Profile by Serial Number:
node .agents/skills/adspower-browser/scripts/sync-user-agents.js --serial 3
```
