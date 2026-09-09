# KI Patch: AdsPower Golden Fingerprint Profile Creation Standard

Patch ID: `autolab-adspower-golden-fingerprint-2026-09-09`

Merge this finding into the existing
`autolab_multi_account_adspower_proxy_architecture` KI. Do not replace or
relocate the KI folder, remove existing SOPs, or apply this patch twice.

## Verified finding

When creating browser profiles via AdsPower Local API `POST /api/v1/user/create`
without explicitly supplying a detailed `fingerprint_config`, AdsPower randomizes
across all device platforms, creating mobile Android/iOS or macOS profiles instead
of Windows Desktop.

In AdsPower, once a profile is created as a mobile/macOS platform, the OS type is
permanently locked in AdsPower's internal database. Updating User-Agent or calling
`new-fingerprint` later DOES NOT change the platform icon or resolve the mobile
behavior. Furthermore, AdsPower default settings leave AudioContext noise disabled
(`audio: '0'`), leave WebRTC unshielded, and do not automatically bind Timezone and
Language to the proxy IP.

## Required provisioning rule

All newly provisioned AdsPower browser profiles for AutoLab automation MUST be
created with the AutoLab Golden Fingerprint standard:

1. **OS Platform Lock:** `random_ua.ua_system_version: ["Windows 10", "Windows 11"]`
   (Guarantees 100% Windows PC Desktop; eliminates mobile/macOS profiles).
2. **AudioContext Noise:** `audio: "1"` (Explicitly activates AudioContext noise switch).
3. **WebRTC Replace:** `webrtc: "replace"` (Replaces WebRTC with proxy IP to prevent IP leaks).
4. **Timezone, Geo & Language Based on IP:** `automatic_timezone: "1"`,
   `location_switch: "1"`, `language_switch: "1"`, `page_language_switch: "1"`.
5. **Hardware Noise Isolation:** `canvas: "1"`, `webgl_image: "1"`, `media_devices: "1"`,
   `client_rects: "1"`, `speech_switch: "1"`.
6. **Mandatory Launch Flags Injection:** Immediately after profile creation, persist the
   three Chromium background occlusion arguments while closed:
   - `--disable-backgrounding-occluded-windows`
   - `--disable-background-timer-throttling`
   - `--disable-renderer-backgrounding`
7. **Rate Limit Guard:** Enforce at least 1,300ms pause between consecutive profile
   creations to respect AdsPower Local API's 1 req/sec rate limit.

**Programmatic Standard:** Use `api.createAutoLabProfile()` from `api-client.js`
which automatically bundles these 7 invariants in a single verified call.
