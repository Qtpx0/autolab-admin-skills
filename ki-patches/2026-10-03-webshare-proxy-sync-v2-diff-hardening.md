# KI Patch: Proxy Sync v2 — Diff-Based Zero-Reshuffle, Plan-by-Default & Safety Hardening

Patch ID: `autolab-webshare-proxy-sync-v2-hardening-2026-10-03`

Merge into the existing `autolab_multi_account_adspower_proxy_architecture` KI. **Supersedes the command section of patch `2026-10-03-webshare-inplace-proxy-swap-and-adspower-sync.md`.** Do not replace or relocate the KI folder, and do not apply this patch twice.

## 1. Blind Spots Found in v1 (all fixed in v2)

| # | v1 behavior | Risk | v2 fix |
| :-- | :-- | :-- | :-- |
| 1 | `--sync-all` mapped Webshare item *i* → AdsPower row *i* by list order | On a partial replacement, alive IPs reshuffle between teams → accounts jump IPs → checkpoint risk. Observed: after the full reset, IP `212.42.201.206` moved from row 21 to row 24 | **Diff-based**: rows whose `host:port` still exists in Webshare are never touched; only orphan rows get an unused IP |
| 2 | Live-session guard called `/api/v1/browser/active` | That endpoint needs `user_id`; it returns `{code:-1}`, which v1 read as "0 live sessions" — **the guard never worked** | Uses `/api/v1/browser/local-active`; **fails closed** if the state cannot be read |
| 3 | AdsPower errors treated as success (client resolves `{code:-1}`) | Silent failed writes | Explicit `code !== 0` detection + read-back verification + one slow retry (1.5s) |
| 4 | No plan / dry-run | Mistakes hit 308 profiles instantly | **Plan-only by default**; writes require an `-apply` command |
| 5 | No backup / rollback | No way back | Snapshot of affected rows before every write (`%APPDATA%\AutoLab\AdminSkills\backups\proxy-sync\`, outside Git) + `--rollback` |
| 6 | Single swap picked "newest `created_at`" as the new IP | Wrong IP under concurrent replacements | New IP found by **set-difference** (before vs after), excluding IPs already in AdsPower |
| 7 | Single swap polled 30s, then aborted with AdsPower stale | Row left pointing at a dead IP | Polls 120s; on failure, `proxy:sync-apply` heals that one row |
| 8 | Fetched only first 100 items | Silent truncation if pool > 100 | Paginated for both Webshare and AdsPower |
| 9 | Rows from other providers would be overwritten | Data loss | Rows whose proxy username is not in this Webshare account are skipped |
| 10 | Final message claimed "All 300+ bindings preserved" without checking | Overclaim | Reports only verified counts; non-zero exit on any failure |
| 11 | `npm run proxy:sync-all -- --force` in PowerShell | npm swallows `--force`/`--apply`/`--proxy-id` (prints "using --force Recommended protections disabled") | Flags baked into npm scripts; positional args only |

## 2. Official Commands (v2)

Portable form (works on every admin machine — the kit does not ship `package.json`):

```bash
S=.agents/skills/webshare-proxy/scripts/sync-proxies-in-place.js
node $S --sync-all                       # plan: which rows would change
node $S --sync-all --apply               # execute + backup + verify
node $S --proxy-id 21                    # plan for AdsPower row 21
node $S --proxy-id 21 --apply            # execute (consumes 1 Webshare replacement)
node $S --rollback "<backup.json>" [--apply]
node $S --sync-all --apply --force       # guard override (only when the operator accepts the risk)
node .agents/skills/webshare-proxy/scripts/test-sync-proxies-in-place.js   # offline test
```

npm shortcuts (AutoLab main repo only, flags baked in):

```bash
npm run proxy:sync-all                 # plan: which rows would change
npm run proxy:sync-apply               # execute + backup + verify
npm run proxy:swap 21                  # plan for AdsPower row 21
npm run proxy:swap-apply 21            # execute (consumes 1 Webshare replacement)
npm run proxy:rollback "<backup.json>"
npm run proxy:rollback-apply "<backup.json>"
npm run test:proxy-sync                # offline contract test (10 cases)
```

## 3. Operating Rules

1. Always run the plan first and read the row list before applying.
2. The live-session guard sees **this machine only**. Staff on other machines are invisible — treat them as live unless the operator confirms otherwise.
3. Full Webshare pool reset → `proxy:sync-apply` heals all orphan rows in one pass with no reshuffle.
4. Partial replacement → the same command touches only the replaced rows.
5. Verified at release time: plan run against production returned `100 unchanged / 0 changes`; offline test 10/10 PASS.
