# Public release checklist

Status date: 2026-09-20

## Completed

- [x] Confirm upstream license is GPL-3.0 and keep this derivative GPL-3.0.
- [x] Keep the canonical GPL-3.0 text in `LICENSE`.
- [x] Add a separate prominent modification and attribution notice in `NOTICE`.
- [x] Credit Sasoon Sarkisian as the original upstream author/contributor.
- [x] Rewrite README for the derivative project and document why the fork exists.
- [x] Document complete Google Cloud / OAuth Web client setup for end users.
- [x] Require every user to provide their own Google OAuth Client ID and Client Secret.
- [x] Document all network endpoints and the static OAuth redirect bridge.
- [x] Keep OAuth client secret and refresh token out of plugin `data.json`.
- [x] Keep setup links free of client secrets, OAuth tokens, task metadata and primary-calendar consent.
- [x] Prevent setup links from overriding the canonical OAuth redirect bridge.
- [x] Use Community-directory-compatible plugin ID `tasks-gcal-sync`.
- [x] Use strict semantic versioning in the public manifest.
- [x] Reset `versions.json` to the public derivative compatibility line.
- [x] Remove private-development repository files (`.claude`, persistent `.github` workflows, legacy `.env.template`).
- [x] Clean `.gitignore`, `.npmignore`, `package.json`, `package-lock.json`, and `esbuild.config.mjs`.
- [x] Remove unused Google client libraries, legacy custom crypto code, Node polyfill build logic and unused development dependencies.
- [x] Audit current source tree for dynamic code execution, unsafe HTML injection, shell execution and unexpected network endpoints.
- [x] Check repository history for accidentally committed environment/credential/token/plugin-data files.
- [x] Remove task titles, Markdown lines and vault paths from verbose logs where they are not required.
- [x] Validate imported setup-link size/types and prevent it from importing primary-calendar consent or Auto-sync consent.
- [x] Fix Calendar API concurrency/lock ownership.
- [x] Avoid unsafe synthetic request timeouts and blind retry of ambiguous event-creation POST requests.
- [x] Add/verify pagination for managed Google Calendar event discovery.
- [x] Preserve failed queue items and expose failed sync state instead of silently reporting success.
- [x] Fix recurring-task completion/ID races.
- [x] Verify task deletion after a grace period across the configured scope before removing the Google event.
- [x] Make plugin unload/reload non-destructive.
- [x] Allow explicit zero-minute reminders (`🔔0m`).
- [x] Create a public, verifiable upstream permission request:
      https://github.com/Sasoon/obsidian-gcal-sync/issues/33
- [x] Create draft release-preparation PR #6.
- [x] Run a temporary clean-build verification (`npm ci` + `npm run build`) and remove the temporary workflow afterward.

## Required smoke test before merge/public release

- [ ] Install the build under the new plugin ID/folder `tasks-gcal-sync`.
- [ ] Verify existing `data.json` migration from the old private folder `obsidian-tasks-gcal-sync`.
- [ ] Desktop: connect/reconnect Google.
- [ ] iOS: connect/reconnect Google.
- [ ] Create → update → complete/delete one normal task.
- [ ] Complete one recurring Obsidian Tasks occurrence and verify exactly one new Calendar event for the next occurrence.
- [ ] Create/update/delete one informational `📆` event.
- [ ] Verify `🔔0m`, timed reminders, duration and explicit end time.
- [ ] Verify Auto-sync after restarting Obsidian.
- [ ] Verify dedicated-calendar isolation.
- [ ] Verify `primary` remains blocked until locally confirmed.
- [ ] Verify setup-link import on a second device.
- [ ] Verify moving/cutting a tracked task between in-scope files does not delete its Calendar event.

## Publication

- [ ] Merge PR #6 into `feature/separate-calendar` after the smoke test.
- [ ] Merge the finished feature branch into default `main`.
- [ ] Change repository visibility from private to public.
- [ ] Confirm that no private issue/PR/Actions-log content should remain private before changing visibility.
- [ ] Obtain Sasoon's explicit written approval in upstream issue #33.
- [ ] Create a release tag exactly matching `manifest.version` (currently `0.2.7`, not `v0.2.7`).
- [ ] Run `npm ci && npm run build` from the release commit.
- [ ] Create the GitHub Release manually and attach `main.js`, `manifest.json`, and `styles.css`.
- [ ] Install the GitHub release once manually/with BRAT as a public beta.
- [ ] Submit the public repository to the Obsidian Community Plugins directory.
- [ ] Address any automated/manual Obsidian review feedback.
