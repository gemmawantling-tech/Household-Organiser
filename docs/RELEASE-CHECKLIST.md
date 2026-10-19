# Release and recovery

## Before merging

1. Review the combined UX pull request and green CI results. It contains the work
   in pending #8/#9; do not merge stale duplicate PRs afterwards. No Firebase rules
   deployment is needed for the dashboard, assignment or outbox changes.
2. Retain the old commit/release identifier for rollback. The data format and
   Firestore/Storage paths remain unchanged; no migration or destructive seed runs.
3. Confirm real Storage rules/IAM/CORS separately using EVENT-ATTACHMENTS.md.
   Firestore verified-member security has been checked; bucket settings have not.

## After an approved merge

1. Wait for the GitHub Pages build/deployment job to succeed.
2. Fetch main and run `python3 scripts/check-production.py --ref origin/main`.
   It compares actual served HTML, scripts, workers, styles and app manifests,
   rather than inferring deployment from a green job alone.
3. Open the site in Android Chrome. Sign in with the existing account. Confirm
   existing tasks/events before making a small known task change. Verify it on the
   second household phone. Do not create a new household to resolve a load error.
4. Test Calendar day/week/month, open an existing event, change its assignee, save
   and reopen; review a known annual occurrence. Upload/download one approved test
   attachment and verify the other member can access it. Never weaken rules to
   bypass an attachment error.
5. After a successful online load, enable airplane mode. Reopen the installed PWA,
   tick a known task, and confirm the offline/pending indicator. Reconnect and
   confirm saved/shared on both phones. If this browser cannot persist Firestore's
   cache, More displays that limitation; keep the tab open until it syncs.
6. After this UX version has been loaded once, keep it open for a subsequent release and check the update banner. The pre-UX version has no update banner and may need one normal online refresh for this first upgrade. Update only when edits are saved and the pending count is zero.
   Check portrait/landscape, large text and one-handed use on the actual phone.
7. Record the deployed commit, time, public-file check and device results. Until
   these checks complete, describe the code as reviewed/tested, not device-verified.

## Pending changes and recovery

- The outbox journal prefix includes both household and UID; each operation has a unique entry, and Chrome/PWA tabs serialize flushing with Web Locks. Reopen the same signed-in account
  to resume; do not clear site data, uninstall the PWA or switch phones before
  pending changes sync. A full storage warning means keep the tab open and export
  the current organiser from More. A blocked permission error requires access to
  be restored; it must not be called a successful shared save.
- More → Backups exports the current local view, including unsynced task changes.
  JSON includes attachment references, not the files. Keep attachment files
  independently when an independent backup is required.
- Approved imports create a scoped earlier-device snapshot first. More lists up
  to five recent snapshots for download, without deleting older saved snapshots.
  If the recovery copy cannot be written, importing stops. Importing affects the
  shared household and requires an explicit confirmation.
- A corrupt outbox is left intact and blocks silent replacement. The connection-recovery screen offers a cached backup download only when the cache is marked as belonging to the signed-in account. Preserve the
  browser/site data before requesting recovery. Do not clear the queue to make an
  error disappear; export the cached view and have the owner review pending data.
- A rollback restores the previous frontend commit and waits for Pages deployment.
  It does not revert Firestore data. Sync pending edits first: an older frontend
  will not understand the new outbox, although the original state format is valid.
- Rules changes still use the separate manual verify/deploy workflow with an
  expected-live fingerprint. This UX release does not deploy rules or touch CORS.
