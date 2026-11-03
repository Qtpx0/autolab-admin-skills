# AutoLab KI Patch: Mandatory `ipchecker: "ipapi"` Enforcement for `212.42.x` Singapore Proxy Pool (Preventing `ip2location` Lithuania LT & Lithuanian UI Language Bug)
**Date:** 2026-11-03  
**Applies to:** `adspower-browser` & `webshare-proxy` (v1.8.5), `api-client.js`, `resequence-reserve-proxies.js`, `sync-proxies-in-place.js`, `swap-proxy-country.js`

---

## 1. Incident Root Cause Analysis (2026-11-03)
Following the full fleet migration of 100 Webshare Singapore Static Residential Proxies to the `212.42.201.0/24` subnet (Level 3 Communications, AS10753, Singapore), all SunBrowser windows across the fleet unexpectedly switched their UI (`chrome://settings`, extensions popup `"Plėtiniai"`) and `Accept-Language` headers from **English (`en-US`)** to **Lithuanian (`lt-LT`)**, and all 100 proxy entries in AdsPower Proxy Center displayed the Lithuania flag (**🇱🇹 `LT`**).

### 3-Layer Ground-Truth Triangulation:
1. **Network / Real Routing Ground Truth:**
   - Queries to `ipinfo.io`, `ip-api.com`, Google, and Meta Risk Engine confirm `212.42.201.0/24` routes cleanly through **Singapore (`SG`, `Asia/Singapore`, AS10753 Level 3 Parent LLC)**.
2. **AdsPower Proxy IP Checker Mismatch:**
   - All 100 proxy entries in AdsPower were configured with AdsPower's default IP query channel: `"ipchecker": "ip2location"`.
   - `api.ip2location.io` uses a stale GeoIP registry database that misidentifies `212.42.201.0/24` as **`country_code: "LT", country_name: "Lithuania", city_name: "Vilnius"`** due to historical European RIPE/ASN ownership records.
3. **AutoLab Golden Fingerprint Ripple Effect:**
   - AutoLab Golden Fingerprint enforces `language_switch: "1"` and `page_language_switch: "1"` (100% IP-based language matching).
   - When AdsPower refreshed proxy geolocation via `ip2location`, it updated all 100 proxies to `LT` and set `ip_country: "lt"` on connected profiles, causing SunBrowser to launch in **Lithuanian (`lt-LT`)** across every employee machine.

---

## 2. Invariant & Permanent Fleet Resolution (v1.8.5)
1. **Fleet-Wide Cloud Migration (100/100 Proxies):**
   - Updated all 100 proxies in AdsPower Proxy Center via `POST /api/v2/proxy-list/update` from `ipchecker: "ip2location"` to **`ipchecker: "ipapi"`**.
   - Re-running **"ตรวจสอบพร็อกซี" (Check Proxy)** in AdsPower immediately restored **🇸🇬 `SG (212.42.201.x)`** across all 100 proxies and returned all browser UIs to **English (`en-US`)** across every staff machine (synced via AdsPower Team Cloud) with **zero impact on Facebook cookies, sessions, or hardware fingerprints**.
2. **Code-Level Guardrails (`v1.8.5`):**
   - `api.createProxies()` and `api.updateProxy()` in `adspower-browser/scripts/api-client.js` now automatically enforce `ipchecker: "ipapi"` and auto-upgrade any `'ip2location'` input to `'ipapi'`.
   - `resequence-reserve-proxies.js`, `sync-proxies-in-place.js`, and `swap-proxy-country.js` explicitly pass `ipchecker: "ipapi"` on every proxy creation and in-place update.
