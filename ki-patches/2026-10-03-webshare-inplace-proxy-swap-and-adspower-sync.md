# KI Patch: Webshare In-Place Proxy Swap & AdsPower 100-Pool Zero-Loss Synchronization

Patch ID: `autolab-webshare-inplace-proxy-swap-sync-2026-10-03`

Merge this finding into the existing `autolab_multi_account_adspower_proxy_architecture` KI. Do not replace or relocate the KI folder, remove existing SOPs, or apply this patch twice.

## 1. Verified Findings & Architectural Invariants

### 1.1 Empirical Root Cause: 78% Subnet Throttling vs Fast Subnets
- **Empirical Fleet Audit (100 Proxies):**
  - **78% Throttled (78/100 IPs):** Choked at ~160–250 KB/s (~1.5 Mbps) on legacy `82.25.x`, `82.26.x`, `82.27.x`, `82.29.x` Lumen SG subnets due to severe gateway host buffer saturation.
  - **15% Fast (15/100 IPs):** Running at 850–1,200 KB/s (~10 Mbps).
- **Targeted Swap Breakthrough (Case Study: Proxy 21):**
  - Swapping target IP `82.26.234.42` via Webshare v3 replace API allocated new subnet IP `212.42.201.206:9951`.
  - 5 MB upload time dropped from **32.85 seconds** to **2.14 seconds** (Speed: **2.44 MB/s / ~20 Mbps**, a **15x speedup**).
  - Confirmed 100% operational on Facebook Reels by user ("เออตอนนี้เร็วปกติละ").

### 1.2 In-Place AdsPower Proxy Pool Update Schema
- Updating proxy rows via AdsPower Local API `POST /api/v2/proxy-list/update` requires the following payload fields:
  ```json
  {
    "proxy_id": "21",
    "type": "http",
    "host": "212.42.201.206",
    "port": "9951",
    "user": "qzmwwdhy",
    "password": "..."
  }
  ```
- **Tag & Profile Binding Invariants:**
  1. **Tag Preservation:** Team tags (e.g. `Project Com`, `Project King`, `Project G`) remain intact on the updated row.
  2. **Profile Binding Persistence:** All profiles mapped to the proxy row (e.g. Profiles `133, 17, 1` on row `21`) immediately inherit the new IP without requiring individual profile reconfiguration.

### 1.3 Live Session Safety Guard
- Full pool synchronization MUST verify that active browser sessions (`GET /api/v1/browser/active`) equal 0.
- Executing full sync while staff sessions are live causes immediate `ERR_PROXY_CONNECTION_FAILED` disconnects.

---

## 2. Universal Automation Tooling Commands

```bash
# 1. Single Proxy In-Place Replacement (Webshare v3 Replace -> AdsPower Row Update):
npm run proxy:swap -- --proxy-id 21
# Or by old IP:
npm run proxy:swap -- --old-ip 82.26.234.42

# 2. Full 100-Pool Batch In-Place Sync (When Webshare resets 100 IPs):
npm run proxy:sync-all
# Force override active session guard:
npm run proxy:sync-all -- --force
```
