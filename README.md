# Tasks Google Calendar Sync

Privacy-first Obsidian plugin that syncs Obsidian Tasks to Google Calendar.

This repository started from [Sasoon/obsidian-gcal-sync](https://github.com/Sasoon/obsidian-gcal-sync) and keeps its task syntax and one-way sync model, while replacing the shared OAuth backend with a user-owned Google OAuth configuration.

## What this fork changes

- No Sasoon/Netlify token-exchange backend.
- Your own Google Cloud OAuth client.
- OAuth client secret stored in Obsidian SecretStorage.
- Google refresh token stored in Obsidian SecretStorage.
- PKCE state/verifier stay device-local and are not synced through plugin settings.
- Configurable target calendar instead of hard-coded `primary`.
- `primary` requires explicit local confirmation.
- Whole-vault scanning is opt-in; folder mismatches never fall back to scanning everything.
- Automatic orphan cleanup/repair is disabled; destructive cleanup is explicit and confirmed.
- Refresh tokens and in-flight OAuth state are scoped per vault.
- OAuth bridge is isolated in the public `dementevm/obsidian-tasks-gcal-sync-bridge` repository.
- Separate plugin ID: `obsidian-tasks-gcal-sync`.

The plugin requests only:

```text
https://www.googleapis.com/auth/calendar.events.owned
```

## Requirements

- Obsidian 1.11.4+
- Obsidian Tasks
- Google Calendar API enabled in your Google Cloud project
- Google OAuth Web application client
- OAuth bridge at `https://dementevm.github.io/obsidian-tasks-gcal-sync-bridge/`

## Task and reminder syntax

Checkbox tasks keep the upstream syntax:

```markdown
- [ ] Call service 📅 2026-09-21 ⏰ 14:30 🔔30m
```

Informational reminders/events use `📆` and do not have completion state:

```markdown
- 📆 Wife has a manicure 📅 2026-09-21
```

The plugin adds a hidden `<!-- task-id: ... -->` marker to calendar-tracked
items. For checkbox tasks it is stored immediately after the checkbox:

```markdown
- [ ] <!-- task-id: abc123 --> Recurring task 🔁 every day when done 📅 2026-09-20
```

This position is intentional: Obsidian Tasks parses recurrence/date metadata
from the right side of the task. Putting an unknown HTML comment at the end of
the line prevents Tasks from recognizing those fields. When Tasks creates the
next recurring occurrence, the completed occurrence keeps its ID and the new
occurrence receives a fresh one.

For `📆` events with no explicit `⏰` time, the plugin uses the configurable
**Morning Event Time** (09:00 by default) and creates a popup reminder at the
event start. If neither `⏱` nor `➡️` is present, the event lasts 5 minutes
by default.

Examples:

```markdown
- [ ] All-day task 📅 2026-09-21
- [ ] Appointment 📅 2026-09-21 ⏰ 14:30
- [ ] Appointment with reminder 📅 2026-09-21 ⏰ 14:30 🔔30m
- [ ] Time block 📅 2026-09-21 ⏰ 14:30 ➡️ 15:30 🔔15m
- 📆 Morning reminder 📅 2026-09-21
- 📆 Doctor 📅 2026-09-21 ⏰ 14:00 ⏱45m 🔔1h
```

Explicit end time `➡️` takes precedence over `⏱` duration.

### Plain checklists are ignored

Calendar sync is opt-in via the `📅` date marker. Ordinary checklists without a
calendar date are not tracked and do not receive plugin task IDs:

```markdown
- [ ] Milk
- [ ] Cat litter
- [ ] Coffee
```

Adding `📅 YYYY-MM-DD` turns a checkbox task into a calendar-synced task.
Removing `📅` from an already-tracked line explicitly stops calendar tracking and removes its managed event on the next allowed sync.

### Editor suggestions

Type `@` in a Markdown list line to open the plugin's metadata suggestions:

- `@event` → 📆
- `@date` → 📅
- `@time` → ⏰
- `@rem` → 🔔
- `@dur` → ⏱
- `@end` → ➡️

You can also run **Tasks GCal: Create calendar reminder** from the command palette. It opens a small form for title/date/time/reminder/duration and inserts a `📆` line into the active note.

## Privacy model

```text
Obsidian
   |
   | OAuth authorization
   v
Google
   |
   | one-time code + state
   v
Static HTTPS bridge
   |
   | obsidian://auth/gcalsync
   v
Obsidian
   |
   | token exchange
   v
Google

Obsidian Tasks -----------------------> Google Calendar API
```

The bridge contains no secrets and performs no server-side token exchange.

Normal plugin configuration can be synced through your vault. OAuth secrets are intentionally device-local.

## Sync semantics and safety

- Obsidian is the source of truth. Google Calendar edits are not imported back.
- Managed Google events include a description telling you to edit the item in Obsidian.
- `Sync Now` creates/updates explicit items and processes explicit removals; it does **not** perform generic orphan cleanup.
- Generic orphan/duplicate cleanup is available only as an explicit, previewed action from Diagnostics / the sync menu.
- Repair is never run periodically by Auto-sync.
- Recurrence remains owned by the Obsidian Tasks plugin. Each generated occurrence receives its own hidden calendar ID; this plugin does not create a Google recurring series.

## Time zones

Timed events capture the device's IANA time zone on first sync (for example `Europe/Amsterdam` or `Asia/Seoul`) and keep it in item metadata. If you create a theatre ticket while your phone is in Korea, the event is created in the Korean time zone. Later background sync from another country does not reinterpret the same wall-clock time.

## Reminder profiles

Defaults are independent:

- Timed checkbox task reminder: 30 minutes before.
- Informational `📆` reminder: at event start (0 minutes before).
- Informational event with no `⏰`: Morning Event Time, 09:00 by default.
- Timed item duration: 5 minutes by default.
- All-day checkbox tasks: no popup by default. Google all-day reminders can be explicitly enabled; an explicit `🔔` always wins.

## Device setup transfer

Use **Copy Setup Link** in settings or the command palette. The generated `obsidian://tasks-gcal-sync/setup?... ` link can be sent to another device and opened there.

The setup link includes only non-secret configuration such as OAuth Client ID, Calendar ID, sync scope, folders, reminder defaults and mobile options. It never includes:

- OAuth client secret
- Google refresh/access tokens
- task metadata
- hidden task IDs
- Auto-sync=ON consent
- consent to use the primary calendar

After import, configure/select the local SecretStorage entry and authenticate that device if needed.

## Setup

Detailed setup instructions are in:

- [Privacy-first Google OAuth setup](docs/privacy-oauth-setup.md)

Use a dedicated Google calendar such as **Obsidian Tasks** while testing. Put its Calendar ID into the plugin settings rather than using `primary`.

## Building

```bash
npm ci
npm run build
```

The resulting Obsidian plugin consists of:

- `main.js`
- `manifest.json`
- `styles.css`

For manual installation place those files in:

```text
<vault>/.obsidian/plugins/obsidian-tasks-gcal-sync/
```

Then restart/reload Obsidian and enable **Tasks Google Calendar Sync**.

## Current status

Private development version: `0.2.0-private.4`.

Before treating the plugin as stable we still need to validate the complete OAuth and calendar lifecycle on desktop and iOS:

- connect/reconnect
- refresh after token expiry
- create/update/delete
- reminders
- dedicated-calendar isolation
- app restart during mobile OAuth
- LiveSync between devices

## License and attribution

GPL-3.0, matching the upstream project.

Original project: [Sasoon/obsidian-gcal-sync](https://github.com/Sasoon/obsidian-gcal-sync).
