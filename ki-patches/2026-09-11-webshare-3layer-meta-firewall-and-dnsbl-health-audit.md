# KI Patch: Webshare 3-Layer Meta Firewall & Multi-DNSBL Health Audit Architecture

Patch ID: `autolab-webshare-3layer-health-audit-2026-09-11`

Merge this finding into the existing `autolab_multi_account_adspower_proxy_architecture` KI. Do not replace or relocate the KI folder, remove existing SOPs, or apply this patch twice.

## Verified finding

1. **Two-Tier Detection Differentiation:**
   - **Network & Firewall Layer:** When an IP is blacklisted by Meta's network firewalls (e.g. dirty datacenter ranges or abusive IPs), Meta's edge servers immediately drop the connection, resulting in TCP resets, timeouts (>8s), or `HTTP 403 Forbidden` / `HTTP 429 Too Many Requests`.
   - **Account & Behavioral Risk Engine Layer:** Meta's application-level risk engine evaluates the combination of hardware fingerprint, account trust/cookie age, and interaction frequency. Passing network-level checks guarantees the IP is free of network blocks, but account-level safety still mandates using full cookies and realistic posting intervals.

2. **3-Layer Automated Verification Architecture:**
   - **Layer 1 (Meta Edge Direct TLS Handshake):** Establishes an HTTP `CONNECT` tunnel through the proxy directly to `www.facebook.com:443`. An `HTTP 200` or `HTTP 302` response with latency under 500ms proves the IP is completely accepted by Meta's edge CDN.
   - **Layer 2 (Global DNSBL Blacklist Check):** Performs reverse DNS lookups on the proxy IP against authoritative blacklists (`zen.spamhaus.org`, `bl.spamcop.net`, `b.barracudacentral.org`). A clean IP returns `ENOTFOUND` (0 listings).
   - **Layer 3 (AdsPower Pool Correlation):** Verifies the proxy is mapped in AdsPower's Proxy Pool, tracks assigned tags (`Project Kik`, `Project Ton`, etc.), and validates that profile allocation stays within the safe 1:3 ratio.

## Required provisioning rule

1. **Pre-Flight & Periodic Pool Health Inspection:**
   All admins and autonomous agents MUST run the official 3-layer audit before assigning proxies to new teams or whenever unexpected checkpoint spikes occur:
   ```bash
   node .agents/skills/webshare-proxy/scripts/audit-proxy-pool.js
   ```
2. **Automated Fleet Provisioning:**
   When provisioning a new project fleet (e.g. 15 browsers for a new employee), use the official provisioning script:
   ```bash
   node .agents/skills/adspower-browser/scripts/provision-project.js <ProjectName> [count=15]
   ```
   This script automatically resolves the group, allocates dedicated/free proxies in round-robin, enforces the AutoLab Golden Fingerprint standard (Windows Desktop 100%, AudioContext ON, WebRTC Replace), and injects Chromium occlusion flags.
