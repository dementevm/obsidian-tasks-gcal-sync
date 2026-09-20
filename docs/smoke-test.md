# Release smoke test

Status: **PASSED** on 2026-09-20 for the current release candidate on desktop and iOS.

Run this checklist again before every public release when synchronization, OAuth, task parsing, calendar targeting, SecretStorage, or build/release code changes.

## 1. Clean build and installation

- [x] Run `npm ci`.
- [x] Run `npm audit` with zero known vulnerabilities.
- [x] Run `npm run build`.
- [x] Install under `.obsidian/plugins/tasks-gcal-sync/`.
- [x] Verify `main.js`, `manifest.json`, and `styles.css` load successfully.
- [x] Verify the old private plugin folder `obsidian-tasks-gcal-sync` is not enabled at the same time.

Legacy private-build users migrate `data.json` manually and should keep a backup. OAuth secrets remain device-local and must be configured again on each device.

## 2. SecretStorage and OAuth

- [x] Configure a valid local SecretStorage Client Secret ID such as `tasks-gcal-sync-client-secret`.
- [x] Verify refresh-token SecretStorage uses a valid fixed ID and does not include the vault name.
- [x] Authenticate on desktop.
- [x] Restart Obsidian and verify authentication is restored.
- [x] Authenticate independently on iOS.
- [x] Verify HTTP 401 triggers one local refresh-token recovery attempt.
- [x] Verify **Disconnect Google Calendar on this device** on iOS does not sign desktop out.
- [x] Verify reconnecting one device does not invalidate another device's session.

## 3. Manual task CRUD

With Auto-sync OFF:

- [x] Create a dated/timed checkbox task and run **Sync Now**.
- [x] Verify exactly one Google event is created.
- [x] Change title and time; verify the same event is updated.
- [x] Verify `🔔0m`.
- [x] Complete/delete the task; verify its managed event is removed.
- [x] Verify no duplicate event remains.

## 4. Auto-sync and rapid edits

With Auto-sync ON:

- [x] Create a new task and verify automatic creation.
- [x] Verify no CodeMirror `EditorView.update` nested-dispatch errors.
- [x] Perform rapid title/time edits while a previous sync is still finishing.
- [x] Verify the final user edit is not dropped by just-synced cooldown or task locking.
- [x] Verify no revoked Immer proxy error occurs.

## 5. Editor UX

- [x] Verify `@event`, `@date`, `@time`, `@rem`, `@dur`, and `@end`.
- [x] Verify `@time` works after an existing `📅 YYYY-MM-DD`.
- [x] Edit an existing task title in the middle/end of the line.
- [x] Insert/remove spaces and words; verify the cursor does not jump to the start.
- [x] Verify normalization keeps calendar-only metadata compatible with Obsidian Tasks recurrence parsing.

## 6. Move and delete safety

- [x] Cut a tracked task from one in-scope note and paste it immediately into another in-scope note.
- [x] Verify the same `task-id` survives the move.
- [x] Verify the Google event is not deleted or duplicated.
- [x] Delete the moved task for real.
- [x] Verify delayed deletion checks the configured scope, then removes the Google event.

## 7. Recurring Obsidian Tasks

- [x] Create a Tasks recurring item.
- [x] Complete multiple occurrences on desktop.
- [x] Verify the completed occurrence keeps its old `task-id`.
- [x] Verify each new occurrence receives a fresh `task-id`.
- [x] Verify Google contains only the current managed occurrence, without duplicates.
- [x] Repeat completion from **Reading mode**.
- [x] Verify opening Edit mode afterwards does not change the new ID again or create another Calendar event.
- [x] Repeat the Reading-mode recurrence flow on iOS.

## 8. Informational events

- [x] Create a `📆` item with date only and verify Morning Event Time.
- [x] Add explicit `⏰`, `⏱`, and `🔔`.
- [x] Verify explicit `➡️` end time overrides duration.
- [x] Delete the line and verify delayed removal of its managed Google event.

## 9. Sync scope

With **Scan Entire Vault = OFF**:

- [x] Configure one valid test folder.
- [x] Verify an item inside the folder syncs and receives a `task-id`.
- [x] Verify an item outside the folder receives no `task-id` and no Google event.
- [x] Configure a nonexistent folder and verify no fallback to whole-vault scanning.
- [x] Verify manual Sync Now fails safely with a clear no-configured-scope error.

Then:

- [x] Enable **Scan Entire Vault** explicitly.
- [x] Verify a new task outside the previous folder now syncs.

## 10. Calendar targeting and primary safety

- [x] Verify `primary` requires explicit local confirmation.
- [x] Verify cancel does not silently activate `primary`.
- [x] Verify a newly created item uses the currently configured default Calendar ID.
- [x] Switch dedicated → primary → dedicated.
- [x] Verify existing items remain bound to the calendar in which they were originally created.
- [x] Verify edits/deletes target that bound calendar even when the default Calendar ID is different.
- [x] Verify changing the default does not migrate or copy existing items between calendars.
- [x] Verify no cross-calendar PUT/DELETE errors or duplicates.

## 11. Setup link

- [x] Generate a setup link while Auto-sync is enabled.
- [x] Import it on another device.
- [x] Verify ordinary configuration transfers.
- [x] Verify Client Secret, refresh/access tokens, task metadata, task IDs, Auto-sync consent, and primary-calendar consent do not transfer.
- [x] Verify no Calendar mutation occurs before local OAuth configuration and explicit sync enable/action.

## 12. iOS + LiveSync

- [x] Create a task on iOS and verify one Google event.
- [x] LiveSync the note to desktop and edit it there.
- [x] Verify the same event is updated with no duplicate.
- [x] Edit it again from iOS and verify the same event is updated.
- [x] Verify iOS disconnect is device-local and desktop authentication remains valid.
- [x] Verify Reading-mode recurring Tasks work after LiveSync without ID churn or duplicate events.

## 13. Restart and persistence

- [x] Restart desktop Obsidian with Auto-sync enabled.
- [x] Verify Google auth, Calendar ID, scope, and Auto-sync state persist.
- [x] Verify restart performs no destructive cleanup and creates no duplicates.
- [x] Create a task after restart; verify automatic sync.
- [x] Restart again and update it; verify the same event is updated.

## 14. Diagnostics and cleanup safety

- [x] Open/close Diagnostics and verify it is read-only by itself.
- [x] Open **Clean Orphaned Calendar Items…** and cancel.
- [x] Verify Cancel performs no Calendar or metadata mutation.
- [x] Verify normal plugin load/unload does not run generic orphan cleanup.
- [x] Perform final Calendar audit: no new duplicate/orphan smoke events and no ordinary Google events were modified unexpectedly.

## 15. Repository freshness regression

After modernizing TypeScript/build configuration and removing legacy CSS/ID helpers:

- [x] Create a new tracked task and verify its hidden task ID is not visually rendered.
- [x] Edit title/time from desktop and verify the same Google event is updated without duplication.
- [x] Verify ordinary/nested checklists retain normal Obsidian layout after removal of legacy global task CSS.
- [x] Complete a recurring task from Reading mode and verify fresh occurrence ID/no duplicate Calendar event.
- [x] Create/edit a task on iOS and verify Web Crypto/static imports work without ID-generation errors.
- [x] Verify the iOS-created task can subsequently be edited from desktop and updates the same Calendar event.
- [ ] Open an existing tracked note on iOS from a cold/open state and verify the raw `<!-- task-id: ... -->` marker is hidden immediately, before the first editor transaction.
- [ ] Reload the plugin/app on iOS and repeat the initial-render visibility check.

## Release gate

A release candidate is ready for merge/tagging when:

- [x] the full functional smoke test above passes;
- [x] `npm audit` is clean;
- [x] clean `npm ci && npm run build` succeeds locally;
- [x] GitHub Build workflow is green on the release-preparation/final main commit;
- [x] release version metadata is bumped consistently before tagging;
- [ ] the tag exactly matches `manifest.json.version`.
