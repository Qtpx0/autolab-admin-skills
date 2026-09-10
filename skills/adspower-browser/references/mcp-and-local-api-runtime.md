# AdsPower Local API Runtime & MCP Integration Architecture

> **Official Standard:** AutoLab Multi-Account Scale Architecture  
> **Applicable AdsPower Versions:** v8.7.0+ (Tested on v8.7.23)  
> **Key Modules:** `admin-kit-core.js`, `api-client.js`, `mcp-runner.js`

---

## 1. The Core Problem: Rotating Local API Ports

In AdsPower v8.7+, whenever the AdsPower desktop application starts or restarts, its internal HTTP service binds to an ephemeral local port (e.g., `7316`, `2674`, `14555`, `50325`).

If an automation system or MCP client relies on:
1. **Hardcoded Port in JSON:** After application restart or PC reboot, the port changes, causing immediate `Connection Refused` errors.
2. **Brute-Force Port Scanning (`netstat`):** Scanning thousands of listening ports is slow, error-prone, burns CPU, and risks hitting unauthenticated rate limits.

---

## 2. The Ground Truth: AdsPower Runtime File (`local_api`)

Whenever AdsPower starts up and successfully binds to an HTTP port, **it immediately writes its active URL and port to a local plain-text file on disk in 0 milliseconds:**

### File Locations:
* **Windows:** `%APPDATA%\adspower_global\cwd_global\source\local_api`  
  (e.g. `C:\Users\<USER>\AppData\Roaming\adspower_global\cwd_global\source\local_api`)
* **macOS:** `~/Library/Application Support/adspower_global/cwd_global/source/local_api`

### File Format:
```text
http://local.adspower.com:<ACTIVE_PORT>/
```
*(Example: `http://local.adspower.com:2674/`)*

---

## 3. AutoLab Zero-Config Dynamic Port Resolver

Our `adspower-browser` skill resolves the live port deterministically without brute-force scanning:

1. **Direct Disk Read (0ms):**
   `admin-kit-core.js` reads `local_api` directly via `getLiveAdsPowerPort()`.
2. **Lightweight Health Check (`/status`):**
   Probes `http://127.0.0.1:<PORT>/status` (timeout: 500ms). This endpoint returns `{"code":0,"msg":"success"}` without consuming the 1 req/sec rate limit of `/api/v1/user/list`.
3. **Emergency Fallback:**
   If the runtime file is absent (e.g., headless or non-standard install), it checks standard default ports (`[14555, 13659, 50325, 6288, 2860, 13249]`).

---

## 4. Seamless MCP Integration (`mcp-runner.js`)

AdsPower's built-in MCP export (`local-api-mcp-typescript`) normally hardcodes the active port in its environment configuration:

```json
{
  "mcpServers": {
    "adspower-local-api": {
      "command": "npx",
      "args": ["-y", "local-api-mcp-typescript"],
      "env": {
        "PORT": "7316",
        "API_KEY": "..."
      }
    }
  }
}
```

### The AutoLab Solution: Zero-Hardcoding Dynamic Runner
Instead of running `npx` directly with a hardcoded `PORT` and exposed `API_KEY`, use `mcp-runner.js`:

```json
{
  "mcpServers": {
    "adspower-local-api": {
      "command": "node",
      "args": [
        "G:\\Dev\\Extension-Premiere-Pro\\.agents\\skills\\adspower-browser\\scripts\\mcp-runner.js"
      ]
    }
  }
}
```

### Why this is 100% resilient:
1. **Dynamic Port Injection:** Every time the IDE or Agent initializes the MCP server, `mcp-runner.js` reads the current `local_api` file and injects the live port into `process.env.PORT`.
2. **Secret Shield:** Pulls `adsPowerApiKey` safely from `%APPDATA%\AutoLab\AdminSkills\credentials.json` without putting plaintext API keys into workspace git repositories.
3. **Survival across Reboots:** You can close/open AdsPower or restart the computer 1,000 times—MCP connects on the first attempt without manual configuration edits.

---

## 5. Alternative / Companion: Lock Port in AdsPower GUI (Fixed Port)

If you prefer AdsPower to always bind to the exact same port:
1. Open AdsPower GUI.
2. Click **Settings ⚙️** (top right corner).
3. Select **Local API** from the left menu.
4. Set **Port** to a fixed number (e.g. `50325` or `7316`).
5. Click **Save**.
