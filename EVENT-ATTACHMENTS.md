# Event details and private attachments

## Behaviour and data preservation

Tap an event in Plans on this date, Next 7 days or Coming up to open its full
editor. Location, notes and booking information are plain text. Save changes to
the event, then reopen it to upload a PDF, PNG, JPEG or WebP (1 byte–10 MB).
Attachment buttons download the original file with the signed-in Firebase session.
Both verified household members have the same access. Uploads are saved immediately;
Cancel discards only unsaved text edits. Delete removes the entire event/series.

Weekly, monthly and yearly repeat from the first saved date, never before it.
Monthly events use the last day of short months and return to the original day in
longer months. A 29 February anniversary uses 28 February in non-leap years.
Editing a generated occurrence edits the whole series; individual exceptions and
end dates are not supported. No future event documents are created.

Existing event IDs, legacy `note` values and unknown event fields remain intact.
No migration, seed or membership changes are required. Event saves are Firestore
transactions updating only `data.events` in the existing
`households/{id}/tasks/organiser` document. Task saves merge only local changes
against the latest server data so they preserve concurrent events and attachments.
Two simultaneous edits to the same field still use the last successful save.
Older app tabs should be refreshed before editing alongside this version.

Files live at `households/{id}/events/{eventId}/{random UUID}`. Only a filename,
object ID, type and size are stored on the event. No public Firebase download URLs
are generated or stored. The service worker never caches private file contents.
JSON backups contain references, not file contents; they work only while the
objects remain in the original household's bucket. Export files separately for
an independent backup. Deleting an event deliberately leaves its Storage objects
in place (to avoid irreversible file deletion); an administrator can remove orphan
objects after reviewing retention/backup needs. Failed metadata writes attempt to
clean up the new upload, but an interrupted browser may also leave an orphan.

## Required production checks — manual, after approval

No Firebase deployment, CORS change, IAM change or live data write was performed
while preparing this PR. The environment has no Google project credentials, so
live bucket existence, billing, IAM, CORS and currently published Storage rules
could not be verified. Emulator tests verify the proposed rules, not production.

1. In project **home-organised**, confirm Storage is enabled and the configured
   bucket is **home-organised.firebasestorage.app**. Confirm the project's billing
   plan supports Cloud Storage. Record/export the current Storage rules and CORS
   configuration before changing either. Review any existing objects and paths:
   the proposed rules deny paths outside the new attachment prefix, so merge any
   legitimate pre-existing permissions explicitly instead of replacing blindly.
2. Review `storage.rules`. Its cross-service Firestore membership lookup requires
   the Firebase Storage service agent to read Firestore for rule evaluation.
   Publish via the Firebase console's Storage Rules tab and accept its documented
   cross-service permission prompt if needed, or follow Firebase's service-agent
   setup guidance. Do not make the bucket public or give members admin IAM roles.
   Confirm bucket IAM/ACLs have no public (`allUsers`/`allAuthenticatedUsers`)
   object access that would bypass these rules.
3. **Only after explicit approval**, publish the reviewed Storage rules in the
   console, or run `npx firebase deploy --only storage --project home-organised`
   from the reviewed commit with an authorised administrator account. Do not run
   a broad `firebase deploy`. Existing Firestore rules do not need changing.
   The existing GitHub Firebase rules workflow still deploys **Firestore only**;
   merging this PR or running its verify operation does not publish Storage rules.
4. Authenticated browser downloads with `getBlob` require bucket CORS for the app
   origin. Inspect `gcloud storage buckets describe
   gs://home-organised.firebasestorage.app --format='json(cors_config)'`.
   `storage.cors.json` contains the current GitHub Pages origin. If other approved
   app origins already exist, merge them rather than losing existing entries.
   After reviewing the final file and approval, use `gcloud storage buckets update
   gs://home-organised.firebasestorage.app --cors-file=storage.cors.json`.
   CORS does not grant file access; Firebase authentication and rules still apply.
5. With both real household accounts, upload and download a test ticket. Check a
   signed-out browser and another household cannot download it. Check an existing
   event, task and membership remain visible before releasing the frontend.
   Failures show in the editor; never weaken the rules to work around them.

The MIME allowlist is not malware scanning; files are downloaded as attachments,
not rendered in the organiser. Existing membership and invitation security rules
are unchanged. The organiser still uses its existing single-document schema and
Firestore's document-size limit; file bytes are kept out of that document.

## Tests

- `npm ci --ignore-scripts`
- `npm test` — invitation, deployment safety, recurrence, file validation and
  concurrent-save preservation.
- `npm run test:rules` — Firestore and Storage emulators, demo project only.
- `npx playwright install chromium` then `npm run test:browser`. Alternatively set
  `CHROMIUM_PATH` to an installed Chromium executable. The mobile browser test
  mocks all Firebase SDK traffic, covering details, saves, recurrence, files and
  errors without contacting the production project.
