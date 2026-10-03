---
name: webshare-proxy
description: "Webshare Proxy REST API operations via v2 API. List, search, filter, download proxies; inspect bandwidth usage and subscription limits; execute automated proxy replacement for tainted/dirty IPs; perform IP health pre-flight checks; and bridge Webshare proxies directly into AdsPower browser profiles."
---

# Webshare Proxy Management API Skill

This skill provides comprehensive operational workflows, API endpoints, and automation scripts for managing **Webshare Static Residential & Datacenter Proxies** via the official **Webshare v2 REST API** (`https://proxy.webshare.io/api/v2/`).

If `references/local-overrides.md` exists, read it after this file. Local
guidance may extend this skill but must not weaken credential, proxy-pool, or
verification rules.

### Upstream Git Auto-Sync Invariant
Before executing proxy audits, health checks, or country swaps, the AI agent SHOULD ensure local skills match the latest official distribution at `https://github.com/Qtpx0/autolab-admin-skills.git` (pull/sync latest manifest and patches if newer).

---

## 1. Authentication & Base URL

* **Base URL:** `https://proxy.webshare.io/api/v2/`
* **Authorization Header:** `Authorization: Token <WEBSHARE_API_KEY>`
* **Content-Type:** `application/json`

---

## 2. Core API Endpoints Reference

### 2.1 Proxy List & Retrieval
* **List Proxies:** `GET /api/v2/proxy/list/`
  * Query parameters: `page`, `page_size` (max 250), `country_code` (e.g. `SG`, `US`), `mode` (`direct` / `backbone`)
  * Response contains: `results` array with `proxy_address`, `port`, `username`, `password`, `country_code`, `valid`, `last_verification`
* **Download Proxy List (Raw Text):** `GET /api/v2/proxy/list/download/{token}/{plan_type}/`
  * Customizable format: `{ip}:{port}:{username}:{password}`

### 2.2 Verified Webshare v3 Proxy Replacement & Country Swap API
* **Endpoint:** `POST https://proxy.webshare.io/api/v3/proxy/replace/`
* **Headers:** `Authorization: Token <TOKEN>`, `Content-Type: application/json`
* **JSON Payload Schema (Verified Ground Truth):**
  ```json
  {
    "to_replace": {
      "type": "ip_address",
      "ip_addresses": ["82.29.239.213"]
    },
    "replace_with": [
      {
        "type": "country",
        "country_code": "US"
      }
    ],
    "dry_run": false
  }
  ```
* **Polling Status Endpoint:** `GET https://proxy.webshare.io/api/v3/proxy/replace/{ID}/`
  * Poll every 1-2 seconds until `state === 'completed'` (Takes 3-5 seconds).
* **List Replacement History:** `GET https://proxy.webshare.io/api/v3/proxy/replace/`


### 2.3 Bandwidth, Stats & Subscription
* **Subscription Plan & Limits:** `GET /api/v2/subscription/`
  * Returns: active plan (`static_residential` / `standard`), allocated IPs, total bandwidth limit, expiration date.
* **Bandwidth Usage Stats:** `GET /api/v2/stats/`
  * Returns: total bandwidth used (bytes), breakdown by day/hour, transfer rates.

### 2.4 Proxy Configuration
* **Get Settings:** `GET /api/v2/proxy/config/`
* **Update Auto-Refresh (Keep Disabled):** `PATCH /api/v2/proxy/config/`
  * Body: `{"auto_refresh": false}` (Guarantees static persistence for Facebook multi-account safety)

---

## 3. Automation Scripts & Workflows

### 3.1 3-Layer Health Inspection (Meta Firewall, Multi-DNSBL & AdsPower Pool Audit)
Before importing or auditing Webshare proxies attached to Facebook accounts:
Run the official high-speed health audit script:
```bash
node .agents/skills/webshare-proxy/scripts/audit-proxy-pool.js
```
The audit executes a rigorous 3-layer inspection across all 50-100 proxies concurrently:
1. **Network Layer (Meta Edge TLS Handshake):** Establishes an HTTP `CONNECT` tunnel to `www.facebook.com:443` via the proxy and verifies a healthy response (`HTTP 200/302`) in <500ms (confirms IP is not blocked by Meta's network firewalls).
2. **Global DNSBL Blacklist Check:** Resolves reversed IP addresses against `zen.spamhaus.org` (Spamhaus ZEN), `bl.spamcop.net` (SpamCop), and `b.barracudacentral.org` (Barracuda).
3. **AdsPower Pool Correlation:** Cross-references the proxy with AdsPower Proxy Pool tags (e.g. `Project Kik`, `Project Ton`) and checks profile allocation counts.
If any IP fails or exceeds score limits, trigger automated replacement via `swap-proxy-country.js` or the Webshare v3 replace API.

### 3.2 Bridge from Webshare API to AdsPower Local API
1. Fetch clean proxies from Webshare API.
2. Format payload for AdsPower:
   ```json
   {
     "proxy_soft": "other",
     "proxy_type": "http",
     "proxy_host": "...",
     "proxy_port": "...",
     "proxy_user": "...",
     "proxy_password": "..."
   }
   ```
3. Call AdsPower Local API `create-proxy` or `create-browser` / `update-browser` on Port `50325` (or active port).
   * **Schema warning:** the `proxy_host/proxy_port/...` shape above is for **profile** `user_proxy_config` only.
     The **Proxy Pool** API `POST /api/v2/proxy-list/update` requires `{ proxy_id, type, host, port, user, password }`
     (using `proxy_host` there returns `data error`).
4. Whenever this workflow creates an AdsPower profile, follow the sibling
   `adspower-browser` AutoLab Official Profile Invariant and persist all three
   Chromium anti-background launch arguments before the profile is opened.

### 3.3 Automated High-Speed Country Swap Script (3-5s Execution)
Use the pre-built native script to swap any profile's proxy to USA (or any target country) and bind in AdsPower automatically:
```bash
node .agents/skills/webshare-proxy/scripts/swap-proxy-country.js <profile_no | profile_id | name> [country_code]
```
* **Example:** `node .agents/skills/webshare-proxy/scripts/swap-proxy-country.js "หนัง 001" US`
* Triggers Webshare v3 replace API, polls status, updates AdsPower profile & proxy pool, and verifies connection with `curl.exe` in under 4 seconds!

### 3.4 In-Place Proxy Pool Synchronization & Swapping (Diff-Based, Zero-Reshuffle)
Use `sync-proxies-in-place.js` (v2). **Every command is PLAN-ONLY unless you use an `-apply` command.**
> npm shortcuts below exist only in the AutoLab main repo. On admin machines use the direct form:
> `node .agents/skills/webshare-proxy/scripts/sync-proxies-in-place.js --sync-all [--apply]` / `--proxy-id 21 [--apply]` / `--rollback <file> [--apply]`
```bash
# Diff sync — heals ONLY rows whose IP disappeared from Webshare (full reset or partial)
npm run proxy:sync-all            # plan: shows exactly which rows change
npm run proxy:sync-apply          # execute + backup + read-back verify

# Single targeted replacement (consumes 1 Webshare replacement from quota)
npm run proxy:swap 21             # plan for AdsPower row 21
npm run proxy:swap-apply 21       # execute

# Rollback from a backup snapshot printed by any apply run
npm run proxy:rollback "<backup.json>"
npm run proxy:rollback-apply "<backup.json>"

# Offline contract test (no network)
npm run test:proxy-sync
```
* **Shell gotcha:** in PowerShell `npm run x -- --flag` loses the flag (npm swallows `--apply`, `--force`). Flags are therefore baked into the npm scripts. For `--force`, call node directly:
  `node .agents/skills/webshare-proxy/scripts/sync-proxies-in-place.js --sync-all --apply --force`
* **Key Invariants:**
  1. **Zero-Reshuffle:** rows whose IP still exists in Webshare are never touched; IPs never move between teams/households.
  2. **Tag & Binding Preservation:** updates are in place on the same `proxy_id`; tags and bound profiles stay attached.
  3. **Unmanaged rows untouched:** rows whose proxy username is not in this Webshare account are skipped.
  4. **Backup before write:** snapshot saved to `%APPDATA%\AutoLab\AdminSkills\backups\proxy-sync\` (outside Git, contains passwords).
  5. **Read-back verification:** every changed row is re-read; mismatches are retried once at 1.5s pace; non-zero exit on failure.
  6. **Live-session guard limits:** uses `/api/v1/browser/local-active` and sees **this machine only**. Other staff machines are invisible — treat staff as live. The guard fails closed if it cannot read state.
  7. **Single swap identifies the new IP by set-difference** (before vs after), never by "newest created_at". If the AdsPower update fails after Webshare replaced the IP, `npm run proxy:sync-apply` heals that row only.
