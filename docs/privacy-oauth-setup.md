# Privacy-first Google Calendar setup

This fork uses a user-owned Google OAuth client and never sends OAuth tokens
through the upstream Sasoon/Netlify backend.

## Architecture

```text
Obsidian (desktop/iOS)
    |
    | OAuth authorization request
    v
Google
    |
    | one-time code + state
    v
Static HTTPS redirect bridge
    |
    | obsidian://auth/gcalsync
    v
Obsidian
    |
    | code + PKCE verifier + client secret
    v
Google token endpoint
```

The bridge receives only Google's short-lived authorization response and sends
it back to Obsidian. It contains no Google client secret, refresh token, vault
content, or calendar data.

## Requirements

- Obsidian 1.11.4 or newer.
- Google Calendar API enabled in a Google Cloud project.
- A Google OAuth client of type **Web application**.
- OAuth bridge: `https://dementevm.github.io/obsidian-tasks-gcal-sync-bridge/`.
- A dedicated Google calendar is recommended, for example `Obsidian Tasks`.

## Google Cloud

1. Create or select a Google Cloud project.
2. Enable **Google Calendar API**.
3. Configure the OAuth consent screen.
4. For personal use, keep the app in Testing and add your Google account as a test user.
5. Create an OAuth client:
   - Application type: **Web application**
   - Authorized redirect URI: `https://dementevm.github.io/obsidian-tasks-gcal-sync-bridge/`
6. Copy the Client ID and Client Secret.

The plugin currently requests only:

```text
https://www.googleapis.com/auth/calendar.events
```

## Redirect bridge

The canonical bridge for this private plugin is:

```text
https://dementevm.github.io/obsidian-tasks-gcal-sync-bridge/
```

Its source is intentionally public in `dementevm/obsidian-tasks-gcal-sync-bridge`.
It performs no server-side processing, stores nothing, and contains no client
secret or refresh token.

Use this URL exactly in Google Cloud, including the trailing slash.

## Obsidian configuration

Open **Settings → Google Calendar Sync**.

1. Set **Calendar ID**.
   - Prefer the ID of a dedicated `Obsidian Tasks` calendar.
   - `primary` remains available for compatibility.
2. Set **OAuth Client ID**.
3. Under **OAuth Client Secret**, create/select an Obsidian SecretStorage entry
   containing the Google OAuth client secret.
4. Keep **OAuth Redirect Bridge URL** as `https://dementevm.github.io/obsidian-tasks-gcal-sync-bridge/`.
5. Connect to Google.

## Device-local secrets

The following values are not written to the plugin's `data.json`:

- OAuth Client Secret — Obsidian SecretStorage
- Google refresh token — Obsidian SecretStorage
- PKCE verifier/state — vault-local application storage

This is intentional. LiveSync can sync the plugin's normal configuration, but
OAuth secrets are provisioned independently on each device.

For a new iPhone or desktop:

1. Sync/install the plugin.
2. Create/select the same client-secret SecretStorage entry on that device.
3. Run **Connect to Google** once on that device.

Each device receives its own refresh token.

## Task syntax

Existing Sasoon task syntax is preserved:

```markdown
- [ ] Call service 📅 2026-09-21 ⏰ 14:30 🔔30m
```

The Obsidian Tasks due date remains compatible while the plugin uses the time
and reminder metadata for Google Calendar.
