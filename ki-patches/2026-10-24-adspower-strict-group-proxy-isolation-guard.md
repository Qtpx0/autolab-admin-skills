# AutoLab KI Patch: Strict Group Proxy Isolation & Zero Cross-Team Binding Guard
**Date:** 2026-10-24  
**Applies to:** `adspower-browser` (v1.8.3), `admin-kit-core`, `api-client.js`

---

## 1. Problem Statement & Historical Context
During agency fleet operations (20 teams, 100 Webshare Singapore residential proxies, 308 profiles), legacy profiles created prior to automated fleet tooling (e.g. Project H created 2026-09-02 and Project S created 2026-09-11) were discovered to have bound to proxies outside their assigned team pools (e.g. Project H accounts bound to Project N, Bow, Com, Q, Lilly, W proxies).

While generic AdsPower CLI allowed binding any proxy ID to any profile, agency isolation requires strict team-boundary enforcement:
1. **Cross-Team Tainting:** If Team A and Team B share an IP concurrently from different physical locations, Meta's risk engine detects abnormal session collisions.
2. **Household Normalcy Model:** Each employee team owns a dedicated pool of proxies with 3–4 profiles per IP. Cross-team bindings violate this balance.

## 2. Invariant & Resolution (v1.8.3)
1. **Automated Guardrail (`api.resolveDedicatedProxy`):**
   - Whenever a profile is created (`createAutoLabProfile`) or proxy bound (`bindProxyPool`), the system inspects the target group's name and cross-references `proxy_tags` in AdsPower.
   - If a requested `proxyid` does NOT belong to the group's tagged pool, execution is blocked with `[STRICT PROXY ISOLATION ERROR]`.
   - If `proxyid` is omitted, the least-loaded proxy within the group's dedicated pool is automatically selected.
2. **Automated Audit Script (`scripts/full-fleet-audit.js`):**
   - Added command to audit all 308 profiles across 20 groups and report exact mismatched counts.
3. **Clean-Up Record:**
   - On 2026-10-24, all 10 legacy mismatched profiles across Project H and Project S were migrated back into their dedicated pools, restoring the entire 308-profile fleet to 100% isolation (0 mismatches).
