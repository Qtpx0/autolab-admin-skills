# AutoLab Admin Skills — Install and Update Contract

This package is the official upstream for the paired `adspower-browser` and
`webshare-proxy` skills. Always update both together.

## Existing installation

1. Locate the project containing `.agents/skills`. Do not update a guessed path.
2. Run `node scripts/update-admin-skills.js --project <PROJECT_PATH> --plan`.
3. Review every reported changed managed file. Move site-specific guidance into
   `references/local-overrides.md`; never discard it.
4. Run the same command with `--apply` only after the review.
5. Apply every unapplied item in `ki-patches/` by merging it into the existing
   Native KI. Never replace or relocate the KI directory.
6. Validate both `SKILL.md` files and restart/reload the AI session.

The updater never deletes unknown files or other skills. It preserves local
override/config paths, stores credentials outside Git, and creates a timestamped
backup before replacing official managed files.

## New installation

Use the same `--plan` then `--apply` flow. If credentials cannot be migrated
from an older installation, configure this machine's values at:

`%APPDATA%\AutoLab\AdminSkills\credentials.json`

Never paste credentials into tracked skill source files.
