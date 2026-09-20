# Public release checklist

Status date: 2026-09-20

## Repository and legal

- [x] Confirm upstream license is GPL-3.0 and keep this derivative GPL-3.0.
- [x] Keep the canonical GPL-3.0 text in LICENSE.
- [x] Add a prominent modification and attribution notice in NOTICE.
- [x] Credit Sasoon Sarkisian as the original upstream author/contributor.
- [x] Rewrite README for the derivative project and document why the fork exists.
- [x] Use Community-directory-compatible plugin ID tasks-gcal-sync.
- [x] Keep strict Semantic Versioning in manifest.json.
- [x] Reset versions.json to the public derivative compatibility line.
- [x] Remove private-development repository files and legacy local-only configuration.
- [x] Replace the temporary/private CI workflows with public reproducible build/release workflows.
- [x] Create a public, verifiable upstream permission request:
      https://github.com/Sasoon/obsidian-gcal-sync/issues/33
- [x] Create draft release-preparation PR #6.

## Privacy and OAuth

- [x] Document complete Google Cloud / OAuth Web client setup.
- [x] Require every user to provide their own Google OAuth Client ID and Client Secret.
- [x] Keep OAuth Client Secret and refresh token out of plugin data.json.
- [x] Store refresh tokens in Obsidian SecretStorage with a valid device-local ID.
- [x] Keep PKCE verifier/state in device-local application storage.
- [x] Keep setup links free of Client Secret, OAuth tokens, task metadata, task IDs, primary-calendar consent, and Auto-sync consent.
- [x] Prevent setup links from overriding the canonical OAuth redirect bridge.
- [x] Make device disconnect local-only so disconnecting iOS does not revoke desktop credentials.
- [x] Recover once from Calendar API 401 using the local refresh token before requiring reconnect.
- [x] Document all network endpoints and the static OAuth redirect bridge.

## Sync and safety implementation

- [x] Audit source for dynamic code execution, unsafe HTML injection, shell execution and unexpected network endpoints.
- [x] Check repository history for accidentally committed environment/credential/token/plugin-data files.
- [x] Remove task titles, Markdown lines and vault paths from verbose logs where unnecessary.
- [x] Fix Calendar API concurrency/lock ownership.
- [x] Avoid synthetic request timeouts and blind retry of ambiguous event-creation POST requests.
- [x] Add/verify pagination for managed Google Calendar event discovery.
- [x] Preserve failed queue items and expose failed sync state.
- [x] Fix recurring-task completion/ID races on editor, Reading mode, LiveSync and iOS.
- [x] Verify task deletion after a grace period across the configured scope before removing the Google event.
- [x] Make plugin unload/reload non-destructive.
- [x] Allow explicit zero-minute reminders (🔔0m).
- [x] Enforce configured sync scope in editor, parser, queue and final Calendar mutation boundary.
- [x] Prevent nonexistent scope from falling back to the whole vault.
- [x] Require explicit opt-in for whole-vault scanning.
- [x] Require explicit local confirmation before using primary.
- [x] Bind each managed event to its owning Calendar ID so changing the default calendar does not migrate/copy existing tasks.
- [x] Isolate Calendar event caches by Calendar ID.
- [x] Keep autocomplete usable after Tasks metadata and preserve the cursor while task lines are normalized.
- [x] Keep generic orphan/duplicate cleanup manual and confirmed.

## Repository freshness review

- [x] Review every tracked root/build/config file before the 1.0.0 tag.
- [x] Modernize tsconfig.json for ES2021, Bundler resolution, strict type checking, and src-only compilation.
- [x] Make the build script use tsconfig.json as the single TypeScript source of truth.
- [x] Refresh version-bump.mjs with node: imports, strict x.y.z validation, and deterministic JSON output.
- [x] Remove stale Google revoke/primary endpoint and synthetic-timeout constants.
- [x] Remove legacy global Obsidian Tasks CSS and keep plugin styling scoped to its own ribbon state.
- [x] Make the hidden task-ID editor replacement genuinely invisible instead of styling/rendering the ID text.
- [x] Replace dynamic require() for task IDs with static imports and remove Math.random() ID fallbacks.
- [x] Tighten error/retry/logging types and remove unused logging/retry helpers.
- [x] Remove unused legacy repair interfaces.
- [x] Update GitHub Actions runtime to checkout/setup-node v5 with Node 24.
- [x] Fix all strict-TypeScript issues exposed by the refreshed configuration.
- [x] Confirm the refreshed repository builds successfully in GitHub Actions.

## Dependencies and build

- [x] Update stale dependencies and commit both package.json and package-lock.json.
- [x] Run npm audit with zero known vulnerabilities.
- [x] Run a clean local npm ci && npm run build.
- [x] Add GitHub Build workflow:
  - clean npm ci;
  - npm audit;
  - version consistency checks;
  - typecheck/production build;
  - installable tasks-gcal-sync-<version>.zip artifact.
- [x] Add GitHub Release workflow:
  - strict x.y.z tag validation;
  - tag/package/manifest/versions consistency checks;
  - clean build and audit;
  - automatic GitHub Release with ZIP, main.js, manifest.json, and styles.css.
- [x] Confirm the new Build workflow is green on the release-preparation commit.

## Functional smoke test

The detailed, reproducible checklist is maintained in [smoke-test.md](smoke-test.md).

- [x] Fresh install under tasks-gcal-sync.
- [x] Desktop OAuth and restart persistence.
- [x] iOS OAuth and device-local disconnect.
- [x] Manual create/update/complete/delete.
- [x] Auto-sync and rapid-edit regression cases.
- [x] Recurring Tasks on desktop and Reading mode.
- [x] Recurring Tasks on iOS after LiveSync.
- [x] Informational 📆 event CRUD.
- [x] 🔔0m, reminder, duration and explicit end-time precedence.
- [x] Task move/cut/paste safety.
- [x] Restricted scope, nonexistent scope and explicit whole-vault mode.
- [x] Dedicated/primary confirmation and per-task calendar binding.
- [x] Setup-link import on a second device.
- [x] Editor autocomplete/cursor stability.
- [x] Restart/Auto-sync persistence.
- [x] Diagnostics and Cancel are non-destructive.
- [x] Final duplicate/orphan audit for newly created smoke-test items.

Legacy private-build migration is manual: back up/copy the old data.json if needed and configure device-local OAuth secrets again. It is not an automatic migration path and is not a blocker for a clean first public release.

## Merge gate

- [x] Build workflow is green for chore/community-release-prep.
- [x] Merge PR #6 into feature/separate-calendar.
- [x] Confirm feature/separate-calendar is green and contains all release-prep commits.
- [x] Merge the finished feature branch into default main.
- [x] Confirm Build workflow is green on main.

## Public release

- [x] Bump the release version consistently in package.json, package-lock.json, manifest.json, and versions.json (1.0.0).
- [ ] Change repository visibility from private to public.
- [ ] Confirm no private issue/PR/Actions-log content should remain private before changing visibility.
- [ ] Create/push a tag exactly matching manifest.version (for example 1.0.0, never v1.0.0).
- [ ] Verify the Release workflow publishes:
  - tasks-gcal-sync-<version>.zip;
  - main.js;
  - manifest.json;
  - styles.css.
- [ ] Install the GitHub release once manually/with BRAT as a public beta.
- [ ] Obtain Sasoon's explicit written approval in upstream issue #33, or follow the applicable Obsidian abandoned-fork process.
- [ ] Submit the public repository to the Obsidian Community Plugins directory.
- [ ] Address any automated/manual Obsidian review feedback.
