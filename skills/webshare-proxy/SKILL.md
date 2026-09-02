---
name: webshare-proxy
description: "Webshare Proxy REST API operations via v2 API. List, search, filter, download proxies; inspect bandwidth usage and subscription limits; execute automated proxy replacement for tainted/dirty IPs; perform IP health pre-flight checks; and bridge Webshare proxies directly into AdsPower browser profiles."
---

# Webshare Proxy Management API Skill

This skill provides comprehensive operational workflows, API endpoints, and automation scripts for managing **Webshare Static Residential & Datacenter Proxies** via the official **Webshare v2 REST API** (`https://proxy.webshare.io/api/v2/`).

If `references/local-overrides.md` exists, read it after this file. Local
guidance may extend this skill but must not weaken credential, proxy-pool, or
verification rules.

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

### 3.1 Pre-Flight Health Inspection (Scamalytics + Fraud Score Check)
Before importing any Webshare proxy into AdsPower or attaching to Facebook accounts:
1. Fetch all proxies via `GET /api/v2/proxy/list/`
2. For each IP, query Fraud Score & Blacklist status:
   * **Score 0–15:** Passed (Clean residential IP)
   * **Score > 35:** Flagged ➔ Auto-trigger `POST /api/v2/proxy/replacement/`
3. Export verified clean list.

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
3. Call AdsPower Local API `create-proxy` or `create-browser` / `update-browser` on Port `6288` (or active port).
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

