# Public release checklist

Status date: 2026-09-20

## Completed

- [x] Confirm upstream license is GPL-3.0 and keep this derivative GPL-3.0.
- [x] Add prominent modification and attribution notice (`NOTICE`).
- [x] Credit Sasoon Sarkisian as the original upstream author/contributor.
- [x] Rewrite README for the derivative project and document why the fork exists.
- [x] Document complete Google Cloud / OAuth Web client setup for end users.
- [x] Require each user to provide their own Google OAuth Client ID and Client Secret.
- [x] Document all network endpoints and the OAuth redirect bridge.
- [x] Keep OAuth client secret and refresh token out of plugin `data.json`.
- [x] Keep setup links free of client secrets, OAuth tokens, task metadata and primary-calendar consent.
- [x] Prevent setup links from overriding the OAuth redirect bridge.
- [x] Use a Community-directory-compatible plugin ID: `tasks-gcal-sync`.
- [x] Use strict semantic versioning in the public manifest.
- [x] Reset `versions.json` to the public derivative compatibility line.
- [x] Fix release workflow so Git tag must exactly match `manifest.version`.
- [x] Add CI validation for manifest metadata and obvious committed/bundled secrets.
- [x] Add production dependency audit to CI.
- [x] Remove unused vulnerable Google client libraries and legacy custom crypto code.
- [x] Audit current source tree for dynamic code execution, unsafe HTML injection, shell execution and unexpected network endpoints.
- [x] Check Git history for accidentally committed `.env`, credential/token JSON and plugin `data.json` files.
- [x] Fix Calendar API concurrency/lock ownership and unsafe synthetic request timeout behavior.
- [x] Avoid blind retry of ambiguous event-creation POST requests.
- [x] Add pagination for managed Google Calendar event discovery.
- [x] Preserve failed queue items and expose failed sync state instead of silently reporting success.
- [x] Fix recurring-task completion bypass of the post-enqueue cooldown filter.
- [x] Make plugin unload/reload non-destructive.
- [x] Align reminder/duration/overnight validation with Calendar behavior.
- [x] Improve reminder-modal input validation.
- [x] Create a public, verifiable upstream permission request:
      https://github.com/Sasoon/obsidian-gcal-sync/issues/33
- [x] Create draft release-preparation PR #6.
- [x] CI passes: manifest check, source secret scan, npm production audit, TypeScript/build, bundle secret scan.

## Required before making the repository public

- [ ] Smoke-test the release-prep build on desktop.
- [ ] Smoke-test the release-prep build on iOS.
- [ ] Verify one normal task: create → update → complete/delete.
- [ ] Verify one recurring Obsidian Tasks occurrence: complete → new occurrence → exactly one new Calendar event.
- [ ] Verify one informational `📆` event.
- [ ] Verify Auto-sync after restarting Obsidian.
- [ ] Verify Google reconnect and token refresh.
- [ ] Verify dedicated-calendar isolation.
- [ ] Verify setup-link import on a second device.
- [ ] Verify the plugin-ID migration from `obsidian-tasks-gcal-sync` to `tasks-gcal-sync` without losing `data.json`.

## Publication

- [ ] Merge PR #6 into `feature/separate-calendar` after the smoke test.
- [ ] Merge the finished feature branch into the default `main` branch.
- [ ] Change the GitHub repository visibility from private to public.
- [ ] Confirm that no sensitive issue/PR/Actions log content becomes unintentionally public with the repository.
- [ ] Wait for / obtain Sasoon's explicit written approval in upstream issue #33.
- [ ] Tag the public release with exactly the version from `manifest.json` (currently `0.2.7`, not `v0.2.7`).
- [ ] Verify the GitHub release contains `main.js`, `manifest.json` and `styles.css`.
- [ ] Install the release once from GitHub/BRAT as a public beta.
- [ ] Submit the public repository to the Obsidian Community Plugins directory.
- [ ] Address any automated/manual Obsidian review feedback.
