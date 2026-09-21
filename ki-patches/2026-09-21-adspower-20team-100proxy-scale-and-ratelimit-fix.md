# KI Patch: AdsPower 20-Team 100-Proxy Scale, Household Normalcy & Local API Rate Limit Fix

Patch ID: `autolab-adspower-20team-100proxy-scale-and-ratelimit-2026-09-21`

Merge this finding into the existing `autolab_multi_account_adspower_proxy_architecture` KI. Do not replace or relocate the KI folder, remove existing SOPs, or apply this patch twice.

## Verified findings & Architectural Invariants

### 1. AdsPower Local API Strict Rate Limit Trap (1 req/sec)
- **Root Cause & Mechanism:** AdsPower's embedded Local API server (running dynamically via `cwd_global/source/local_api`) enforces an undocumented strict rate limit of approximately 1 request per second on write endpoints (`/api/v1/user/update`, `/api/v1/proxy/bind`, etc.).
- **Silent Drop Behavior:** When batch profile update calls or proxy bind requests are issued consecutively without adequate delay (e.g. standard `for` loops or `Promise.all`), AdsPower does NOT return an HTTP 429 error. Instead, it drops requests silently, returning outdated or empty state while the local client assumes success.
- **Mandatory Invariant:** All autonomous agents, batch scripts, and re-balancing routines MUST enforce a sleep of at least 1,400ms between calls:
  ```javascript
  await api.sleep(1400); // 1.4s throttle guard prevents AdsPower Local API silent drop
  ```

### 2. 20-Team / 100-Proxy Fleet Standard (Household Normalcy Model)
- **Fleet Scale:** 20 Active Teams (11 newly provisioned teams + 9 existing teams) managing 307+ profiles across exactly 100 Webshare Static Residential IPs (Singapore).
- **Golden Ratio:** Exactly **5 dedicated proxies per team**.
- **Safe Allocation Ratio:** 15 browser profiles per team distributed across 5 proxies yields an exact 3:1 ratio (3 profiles per IP, max 4 profiles per IP for expanded teams). This perfectly satisfies Meta's Household Normalcy Model (simulating a standard home network sharing a single gateway among 3-4 personal devices).
- **Anti-Correlation Interleaving Rule:** Proxies MUST be assigned in round-robin order across adjacent profiles (e.g., Profile 01 -> Proxy 1, Profile 02 -> Proxy 2, Profile 03 -> Proxy 3, Profile 04 -> Proxy 4, Profile 05 -> Proxy 5, Profile 06 -> Proxy 1). Never assign the same proxy to sequentially numbered profiles.

### 3. Donor Proxy Re-allocation Protocol
- When expanding or re-balancing the proxy pool from donor teams (teams having >5 proxies) to recipient teams (teams having <5 proxies):
  1. **Audit First:** Identify all profiles currently bound to the donor proxy ID.
  2. **Re-map Donor Profiles First:** Re-bind the affected donor profiles to remaining clean proxy IDs within the same donor team, with `await api.sleep(1400)` between each update.
  3. **Verify Donor State:** Ensure no donor profile is still bound to the released proxy ID.
  4. **Allocate to Recipient Team:** Bind the freed proxy ID to the recipient team's unallocated profiles.

## Verified Automation Scripts

1. **Fleet Provisioning:**
   ```bash
   node .agents/skills/adspower-browser/scripts/provision-fleet-11.js
   ```
   Provisions 11 teams x 15 profiles = 165 profiles with 100% Golden Fingerprint standard, Chromium launch flags, and binds proxy pool IDs 51–100.

2. **Proxy Re-balancing & Donor Normalization:**
   ```bash
   node .agents/skills/adspower-browser/scripts/rebalance-proxies-to-5.js
   node .agents/skills/adspower-browser/scripts/fix-donor-rebalance.js
   ```
   Re-allocates donor proxies to ensure an exact 5-proxy-per-team baseline across all 20 teams.
