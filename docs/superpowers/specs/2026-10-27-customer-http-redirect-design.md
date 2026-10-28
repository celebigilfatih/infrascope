# Legacy customer HTTP redirect

The user explicitly requests that the old http://10.60.0.1:8170 URL redirect to HTTPS so existing bookmarks work. Preserve the complete path/query and use a fixed, validated HTTPS destination (not the incoming Host). Certificate trust on each client remains necessary.

8170 is currently published directly by the production app. A redirect on port80 alone would not fix that URL. An app-image change would require publishing/redeploying a new image. Selected implementation: a separate pinned Caddy redirect service takes over the legacy port; change only APP_PORT in the existing .env to a loopback-only backend port, then recreate only app using its exact existing Compose files and image. Keep the existing HTTPS project/config/CA completely unchanged.

No schema/data migration, image upgrade, NMS/database restart, firewall edit or certificate trust change. Expected short app restart. Acquire the installation update lock and HTTPS setup lock. Verify current HTTPS against the exported CA before any changes. Check project ownership, config files, app image, existing port mappings and available backend port; persist original environment bytes in an installation-local recovery file. Journal the transition for safe retry. On ordinary failures stop/remove only owned redirect containers, restore environment and recreate app; preserve recovery state if rollback fails. Refuse unrelated changes rather than overwrite them.

Future standard updates preserve .env APP_PORT, so the loopback binding and independent redirect survive. Old already-completed pilot replay may refuse because its environment hash changed; do not rerun that obsolete pilot. The redirect package does not modify the stable release updater.

Validation: real production fixture, PS5.1 installer, HTTP308 path/query and fixed host, CA identity, HTTPS login/session, unchanged database/env except APP_PORT, repeat/restart, simulated occupied port and invalid ownership, rollback. Only synthetic fixture data.
