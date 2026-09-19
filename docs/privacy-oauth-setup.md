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
3. Open **Google Auth Platform** and configure:
   - **Branding**: app name, support email and developer contact email.
   - **Audience**: **External** for a normal personal Google account.
   - **Data Access**: add only
     `https://www.googleapis.com/auth/calendar.events.owned`.
4. During the first smoke test you may keep the app in **Testing** and add your
   Google account as a test user.
5. After the smoke test, switch the app to **In production**. In Testing,
   authorizations that request Calendar access expire after 7 days, including
   offline refresh tokens. For a personal-use app with fewer than 100 users,
   Google does not require OAuth verification, although an unverified-app
   warning can still be shown.
6. Under **Clients**, create an OAuth client:
   - Application type: **Web application**
   - Authorized redirect URI:
     `https://dementevm.github.io/obsidian-tasks-gcal-sync-bridge/`
   - The scheme, path and trailing slash must match exactly.
7. Copy the Client ID and Client Secret.

The plugin currently requests only:

```text
https://www.googleapis.com/auth/calendar.events.owned
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

Open **Settings → Tasks Google Calendar Sync**.

For the first smoke test, leave **Auto-sync disabled** and restrict
**Folders to Sync** to a dedicated empty test folder so connecting to Google
cannot publish existing vault tasks.

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
