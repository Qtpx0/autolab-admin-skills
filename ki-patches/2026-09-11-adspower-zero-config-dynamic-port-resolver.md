# KI Patch: AdsPower Zero-Config Dynamic Port Resolver & MCP Integration

Patch ID: `autolab-adspower-zero-config-port-2026-09-11`

Merge this finding into the existing
`autolab_multi_account_adspower_proxy_architecture` KI. Do not replace or
relocate the KI folder, remove existing SOPs, or apply this patch twice.

## Verified Finding

In AdsPower v8.7+, the Local API server rotates to an ephemeral HTTP port on every desktop application launch or machine reboot (e.g. `7316`, `2674`, `14555`, `50325`).

1. **Failure of Hardcoded Port in MCP:** AdsPower's official MCP export (`local-api-mcp-typescript`) hardcodes the active port in its environment JSON (`"PORT": "7316"`). Upon restart, this causes immediate `Connection Refused` failures.
2. **Failure of Brute-Force Scanning:** Scanning ports via `netstat -ano` or looping random ports burns CPU, takes up to several seconds, and triggers unauthenticated rate limits.
3. **The 0ms Deterministic Ground Truth:** AdsPower writes its active URL and port directly to a plain-text file on disk immediately upon startup:
   - **Windows:** `%APPDATA%\adspower_global\cwd_global\source\local_api`
   - **macOS:** `~/Library/Application Support/adspower_global/cwd_global/source/local_api`
   - **File Content Format:** `http://local.adspower.com:<PORT>/`

## Required Automation & MCP Architecture

All AutoLab AdsPower automations, scripts, and MCP connectors MUST follow the Zero-Config Dynamic Port Resolver standard:

1. **Direct File Discovery (0ms):**
   Use `getLiveAdsPowerPort()` from `admin-kit-core.js` to read the active port directly from `cwd_global\source\local_api`.
2. **Lightweight Health Check (`/status`):**
   Verify the discovered port by issuing an HTTP GET to `/status` (timeout: 500ms). This endpoint returns `{"code":0,"msg":"success"}` instantly without burning the strict 1 req/sec rate limit of `/api/v1/user/list`.
3. **Emergency Fallback:**
   Fallback to standard known ports (`[14555, 13659, 50325, 6288, 2860, 13249]`) only if the runtime file does not exist on disk.
4. **Dynamic MCP Runner:**
   Connect MCP servers via `scripts/mcp-runner.js` rather than hardcoding static ports in IDE settings. The runner injects the live port and credentials dynamically at startup.
