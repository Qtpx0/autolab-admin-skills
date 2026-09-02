# KI Patch: AdsPower Chromium Occlusion Protection

Patch ID: `autolab-adspower-occlusion-2026-09-03`

Merge this finding into the existing
`autolab_multi_account_adspower_proxy_architecture` KI. Do not replace or
relocate the KI folder, remove existing SOPs, or apply this patch twice.

## Verified finding

On Windows, an AdsPower SunBrowser profile running AutoPost stalled when its
window was fully covered by another fullscreen application. Persisting the
following `launch_args` on the closed profile removed the stall with no observed
delay while YouTube remained fullscreen:

```text
--disable-backgrounding-occluded-windows
--disable-background-timer-throttling
--disable-renderer-backgrounding
```

The profile was reopened through the normal AdsPower UI. The main SunBrowser
process contained all three flags. Two consecutive Reel publishes completed;
both outbound mutations matched inbound post detections and were saved to
Firestore.

## Required provisioning rule

For every newly created AutoLab AdsPower profile:

1. Create the profile and capture its `profile_id`.
2. Keep it closed.
3. Call `update-browser` with `launch_args` as an array containing the three
   flags above, merged with any existing arguments without duplicates.
4. Open normally and verify the main browser process contains all three flags.

This mitigates Chromium background/occlusion scheduling. It does not replace
AutoPost state recovery for reloads, crashes, or unexpected Facebook UI state.
