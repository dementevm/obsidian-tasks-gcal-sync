# Obsidian Community Plugins submission — Tasks Google Calendar Sync

Status date: 2026-10-18. Not submitted yet.

## Plugin and release
- Repository: https://github.com/dementevm/obsidian-tasks-gcal-sync
- Plugin ID: `tasks-gcal-sync`
- Plugin name: Tasks Google Calendar Sync
- Current version: `1.0.2` (keep this version; do not move or recreate the existing Git tag)
- Manifest minimum Obsidian version: `1.11.4`
- GitHub Release: https://github.com/dementevm/obsidian-tasks-gcal-sync/releases/tag/1.0.2
- Required release assets: `main.js`, `manifest.json`, `styles.css`, plus optional installation ZIP.
- Target directory: https://community.obsidian.md

## Upstream status and public permission request
- Original project: https://github.com/Sasoon/obsidian-gcal-sync
- Original author: Sasoon Sarkisian
- Original and derivative licenses: GPL-3.0; retain LICENSE, NOTICE and README attribution.
- Latest upstream commit checked on 2026-10-18: 2026-02-28 (`58db245ff24d31675e7bc55f54b127cd0488146b`).
- Public request: https://github.com/Sasoon/obsidian-gcal-sync/issues/33, opened 2026-09-20 13:41 UTC.
- No response/comment was present as of 2026-10-18.
- The 30-day response window completes 2026-10-20 13:41 UTC. Recheck upstream activity and issue comments before filing, earliest suggested submission date: 2026-10-21.
- Obsidian fork rules require either explicit written upstream author permission or the eligible inactive/unreachable author exception. Do not assert permission was granted.

## Before submission
- [ ] Merge the release-audit/documentation fix into main; verify Build is green.
- [ ] Manually dispatch Release on main for existing tag `1.0.2`; verify it checks out the tagged commit and publishes all assets. Do not retag.
- [ ] Verify the published assets are built from `1.0.2` and test manual installation with the published `main.js`.
- [ ] Recheck latest community directory submission instructions on https://community.obsidian.md.
- [ ] On/after 2026-10-21, recheck upstream last activity and issue #33 response.
- [ ] Submit through the current Community Directory form, disclosing the derivative and public permission request.
- [ ] Resolve reviewer feedback.

## Suggested submission explanation

Tasks Google Calendar Sync is a GPL-3.0 derivative of Sasoon Sarkisian's obsidian-gcal-sync, with attribution retained in README and NOTICE. This fork substantially reworks OAuth so each user provides their own Google client, secrets are stored locally via Obsidian SecretStorage, and calendar/sync safety is explicit. It includes Obsidian Tasks recurrence support, iOS and LiveSync improvements, controlled vault scope and diagnostics.

I publicly requested the upstream author's permission on September 20, 2026: https://github.com/Sasoon/obsidian-gcal-sync/issues/33. As of October 18 there was no response. The upstream repository's latest commit, checked on October 18, was February 28, 2026. Please consider this submission under the directory's inactive/unreachable upstream fork procedure, subject to confirmation of the conditions at the submission date.
