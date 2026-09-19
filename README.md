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

### Editor suggestions

Type `@` in a Markdown list line to open the plugin's metadata suggestions:

- `@event` → 📆
- `@date` → 📅
- `@time` → ⏰
- `@rem` → 🔔
- `@dur` → ⏱
- `@end` → ➡️

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

Private development version: `0.2.0-private.1`.

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
