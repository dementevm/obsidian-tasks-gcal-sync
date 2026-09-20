# Tasks Google Calendar Sync

One-way, privacy-focused synchronization from dated Obsidian Tasks and lightweight calendar reminders to Google Calendar.

> **Status:** preparing for a public Community Plugins release. The plugin is functional on desktop and mobile, but the official Obsidian directory submission still requires public upstream-fork approval and a public release repository.

## Why this project exists

This project started from [Sasoon/obsidian-gcal-sync](https://github.com/Sasoon/obsidian-gcal-sync), licensed under GPL-3.0.

The upstream plugin provided the core idea and task-to-calendar synchronization model. This fork was created because the workflow we wanted had different privacy and safety requirements, especially for multi-device use:

- no shared OAuth client secret embedded in the plugin;
- no server-side token exchange controlled by the plugin author;
- each user owns their Google OAuth client;
- client secrets and refresh tokens stay in Obsidian SecretStorage;
- a dedicated Google calendar is preferred instead of silently using the primary calendar;
- scanning the whole vault is explicit opt-in;
- orphan/duplicate cleanup is a manual, confirmed operation;
- recurring Obsidian Tasks must keep working correctly;
- desktop and iOS should use the same task syntax and sync model.

The result is now a substantially modified derivative project, while retaining attribution and GPL-3.0 licensing.

## Features

### One-way Obsidian to Google Calendar sync

Obsidian is the source of truth. The plugin creates, updates, and removes its managed Google Calendar events based on Markdown items in your vault.

Edits made directly in Google Calendar are not imported back into Obsidian.

### Obsidian Tasks support

A checkbox task is synchronized when it contains a Tasks due-date marker:

```markdown
- [ ] Pay insurance 📅 2026-09-21
- [ ] Dentist 📅 2026-09-21 ⏰ 14:30
- [ ] Dentist 📅 2026-09-21 ⏰ 14:30 🔔30m
- [ ] Meeting 📅 2026-09-21 ⏰ 14:30 ➡️ 15:30 🔔15m
```

Plain checklists without `📅` are ignored:

```markdown
- [ ] Milk
- [ ] Coffee
```

### Lightweight informational events

Use `📆` for calendar reminders that are not completable Tasks:

```markdown
- 📆 Wife has a manicure 📅 2026-09-21
- 📆 Doctor 📅 2026-09-21 ⏰ 14:00 ⏱45m 🔔1h
```

If a `📆` item has no explicit time, the configurable **Morning Event Time** is used.

### Supported metadata

- `📅 YYYY-MM-DD` — date
- `⏰ HH:MM` — start time
- `➡️ HH:MM` — explicit end time
- `⏱30m`, `⏱2h` — duration
- `🔔0m`, `🔔30m`, `🔔2h`, `🔔1d` — popup reminder

An explicit end time takes precedence over duration.

### Recurring Tasks compatibility

Obsidian Tasks owns recurrence. This plugin does **not** create a Google recurring series.

The plugin stores a hidden stable identifier immediately after the checkbox:

```markdown
- [ ] <!-- task-id: abc123 --> Daily review 🔁 every day when done 📅 2026-09-21
```

When Obsidian Tasks generates the next occurrence, the completed occurrence keeps its original ID and the new occurrence receives a fresh ID. This avoids two occurrences pointing to the same Google event.

### Editor autocomplete

Type `@` in a Markdown list item:

- `@event` → `📆`
- `@date` → `📅`
- `@time` → `⏰`
- `@rem` → `🔔`
- `@dur` → `⏱`
- `@end` → `➡️`

There is also a **Tasks GCal: Create calendar reminder** command that inserts a `📆` item using a small form.

### Time-zone preservation

Timed items capture the device IANA time zone when first synchronized.

For example, an event created while your phone is in `Asia/Seoul` keeps that zone even if a later background sync runs from `Europe/Amsterdam`. This prevents travel from silently reinterpreting the original wall-clock time.

### Dedicated-calendar safety

A dedicated calendar such as **Obsidian Tasks** is strongly recommended.

Using `primary` is supported, but requires an explicit local confirmation. That confirmation is deliberately not transferred through setup links.

### Controlled vault scanning

By default, the plugin only scans configured folders/files.

**Scan Entire Vault** is a separate explicit option. If configured folders do not exist or match nothing, sync stops safely instead of falling back to the whole vault.

### Diagnostics and cleanup

Normal sync handles explicit task changes and removals.

Generic orphan/duplicate cleanup is available through Diagnostics and requires user confirmation. It is not run automatically during normal background sync or plugin unload.

## Privacy and security model

The plugin does not use a shared author-owned Google OAuth credential.

Each user creates their own Google Cloud OAuth client.

```text
Obsidian
   |
   | OAuth authorization
   v
Google
   |
   | short-lived authorization code + state
   v
Static GitHub Pages bridge
   |
   | obsidian://auth/gcalsync
   v
Obsidian
   |
   | code exchange using your own OAuth client
   v
Google

Obsidian Tasks -----------------------> Google Calendar API
```

The bridge source is public at [dementevm/obsidian-tasks-gcal-sync-bridge](https://github.com/dementevm/obsidian-tasks-gcal-sync-bridge).

The bridge:

- is static HTML/JavaScript;
- contains no client secret;
- performs no token exchange;
- stores no OAuth tokens;
- stores no vault or calendar data;
- removes the authorization response from browser history before returning to Obsidian.

### What is stored where

**Obsidian SecretStorage, device-local:**

- Google OAuth Client Secret
- Google refresh token

**Plugin settings / vault-synced configuration:**

- OAuth Client ID
- Calendar ID
- sync scope/folders
- reminder defaults
- task metadata and managed Google event IDs

**Temporary device-local storage:**

- OAuth PKCE verifier
- OAuth state

Setup links intentionally exclude secrets, OAuth tokens, task metadata, primary-calendar consent, and Auto-sync consent.

## Network access disclosure

The plugin uses the network only for Google authorization/calendar operations and the static redirect bridge:

- `https://accounts.google.com` — Google OAuth authorization
- `https://oauth2.googleapis.com` — token exchange, refresh, and revocation
- `https://www.googleapis.com/calendar/v3` — Google Calendar API
- `https://dementevm.github.io/obsidian-tasks-gcal-sync-bridge/` — static OAuth redirect bridge

No analytics or client-side telemetry is included.

## Requirements

- Obsidian 1.11.4 or newer
- [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks)
- a Google account
- your own Google Cloud project with Google Calendar API enabled
- your own Google OAuth **Web application** client

## Google Cloud setup

Every user should create their **own** OAuth client. Do not reuse another person's Client ID/Client Secret.

### 1. Create a Google Cloud project

Open [Google Cloud Console](https://console.cloud.google.com/) and create a new project, for example:

```text
Obsidian Tasks Calendar Sync
```

### 2. Enable Google Calendar API

In the selected project:

1. Open **APIs & Services**.
2. Open **Library**.
3. Find **Google Calendar API**.
4. Enable it.

### 3. Configure Google Auth Platform

Open **Google Auth Platform**.

Configure at least:

- **Branding** — app name, support email, developer contact email.
- **Audience** — for a normal personal Google account, use **External**.
- **Data Access** — add only:

```text
https://www.googleapis.com/auth/calendar.events.owned
```

This scope allows the plugin to view, create, edit, and delete events on Google calendars that you own.

For initial testing, you can keep the OAuth app in **Testing** and add your Google account as a test user. Be aware that Google can expire authorizations for external apps left in Testing, so long-term personal use should normally use the appropriate production publishing state for your Google project.

### 4. Create an OAuth client

In **Google Auth Platform → Clients**:

1. Click **Create Client**.
2. Select **Web application**.
3. Give it any recognizable name, for example `Obsidian Tasks GCal`.
4. Under **Authorized redirect URIs**, add exactly:

```text
https://dementevm.github.io/obsidian-tasks-gcal-sync-bridge/
```

The trailing slash matters. Google's redirect URI must exactly match the URI configured in the plugin.

5. Create the client.
6. Copy the **Client ID**.
7. Copy the **Client Secret** and keep it private.

Never commit the Client Secret to GitHub or store it in a Markdown note.

### 5. Create a dedicated Google Calendar

In Google Calendar, create a separate calendar such as:

```text
Obsidian Tasks
```

Open its settings and copy its **Calendar ID**.

A dedicated calendar is safer because the plugin can only affect events in the configured calendar. The `primary` calendar is supported but intentionally requires an extra confirmation.

### 6. Configure the plugin

In **Settings → Tasks Google Calendar Sync**:

1. Set **Calendar ID**.
2. Set **OAuth Client ID**.
3. Under **OAuth Client Secret**, create/select a SecretStorage entry containing your Client Secret.
4. Keep **OAuth Redirect Bridge URL** set to:

```text
https://dementevm.github.io/obsidian-tasks-gcal-sync-bridge/
```

5. Configure the folders you want to sync, or explicitly enable **Scan Entire Vault**.
6. Click **Connect to Google**.
7. Complete Google's authorization flow.

The plugin requests offline access so that it can refresh access tokens without asking you to authenticate every time.

### Additional devices

SecretStorage is device-local.

For each additional desktop/iPhone/iPad:

1. install/sync the plugin;
2. create/select the Client Secret entry in SecretStorage on that device;
3. run **Connect to Google** once.

You can use **Copy Setup Link** to transfer non-secret configuration between devices.

## Installation

### Community Plugins

The plugin is not yet listed in the official Community directory.

Once accepted, installation will be available through **Settings → Community plugins → Browse**.

### Manual installation

Build or download a release and place these files in:

```text
<vault>/.obsidian/plugins/tasks-gcal-sync/
```

Required files:

- `main.js`
- `manifest.json`
- `styles.css`

Reload Obsidian and enable **Tasks Google Calendar Sync**.

### Existing private-build users

Older private builds used the plugin ID/folder:

```text
obsidian-tasks-gcal-sync
```

The Community-compatible ID is now:

```text
tasks-gcal-sync
```

When migrating manually, preserve your existing `data.json` and move/copy the plugin directory to the new ID before enabling the new build. Make a backup of the old plugin directory first.

OAuth secrets are device-local SecretStorage entries and are not embedded in `data.json`.

## Device setup transfer

**Copy Setup Link** creates an `obsidian://tasks-gcal-sync/setup?... ` link containing only non-secret configuration.

It does not contain:

- OAuth Client Secret
- access/refresh tokens
- task metadata
- task IDs
- Auto-sync enabled state
- consent to use the primary calendar

Imported setup links are validated and cannot replace the plugin's canonical OAuth bridge.

## Sync behavior

- Obsidian is authoritative.
- Removing `📅` from a tracked line stops calendar tracking and removes its managed event.
- Deleting a tracked line schedules a delayed verification before the Google event is removed, so normal cut/move/LiveSync operations are not treated as immediate deletions.
- Per-task duplicate reconciliation may occur during sync.
- Generic orphan cleanup requires an explicit Diagnostics action.
- Google events created by the plugin contain private extended properties linking them to their Obsidian task ID.

## Building from source

```bash
npm ci
npm run build
```

The release files are:

- `main.js`
- `manifest.json`
- `styles.css`

Release tags must exactly match `manifest.json` and use strict `x.y.z` Semantic Versioning, for example `0.2.7` — not `v0.2.7`.

## Known limitations

- synchronization is one-way only;
- Google-side edits are overwritten by later Obsidian sync;
- recurrence is handled by Obsidian Tasks rather than Google recurring events;
- each device must be authorized separately;
- the configured Calendar must be owned by the authenticated Google user because the plugin deliberately uses the narrower `calendar.events.owned` OAuth scope.

## Security

Please do not publish OAuth Client Secrets, refresh tokens, setup screenshots containing secrets, or private vault contents in bug reports.

When reporting a security issue, avoid including real calendar event titles or note contents. A dedicated security-reporting process can be added before the first public directory release.

## License and attribution

This project is licensed under **GNU GPL v3.0**, matching the upstream project.

Original project and original author:

- [Sasoon/obsidian-gcal-sync](https://github.com/Sasoon/obsidian-gcal-sync)
- Sasoon Sarkisian

This repository contains substantial modifications made by Mikhail Dementev. The original author remains credited for the upstream work on which this derivative project is based.

Publication in the official Obsidian Community directory is contingent on satisfying Obsidian's fork policy, including publicly verifiable permission from the original author.
