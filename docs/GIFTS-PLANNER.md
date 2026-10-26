# Gifts & occasions planner

This extends the existing Home Organiser. The Firebase project, sign-in,
membership, organiser data, everyday shopping, events, routines and outbox remain
in place. No production data migration, seed or reset runs.

## Experience

Bottom navigation is Today / Calendar / Gifts / Lists / More. The floating
**+ Add** retains the task/event menu and adds a gift/occasion choice. Lists also
has **Plan a gift from shopping**. Shopping import is explicit: keep a linked item
or move it after the gift saves; nothing automatically enters groceries.

Start an occasion, add named recipients or groups, and add one or more gifts.
Recipient cards show gift summaries and organised counts and open one at a time.
Joint gifts reference multiple recipients but exist once; occasion spending counts
the total cost once. Recipient budgets are optional planning allowances, not
amounts to sum with gift/occasion budgets. Actual cost is entered per gift.

Statuses and preparation actions are independent. Booked is never automatically
organised. A gift is organised only when Ready to give or Given **and** all its
actions are ticked. The dashboard progress combines organised gifts and completed
actions; the checklist retains its separate action count. Due dates and optional
reminder dates group actions as overdue, reminders, next seven days or later.
Reminders are in-app only; no notification permission or push service is added.

Gift editors have collapsible details for ideas, purchased/booked descriptions,
budgets, multiple website links and notes. Save a gift before attaching a PDF,
PNG, JPEG or WebP up to 10 MB. Downloads use authenticated blobs rather than public
Firebase token URLs. Duplicate makes a fresh gift with no purchases, files or
completed actions. Move keeps the gift and files and maps its recipients into the
new occasion within the same planner.

Enter a recipient's birthday to store their birthday and create their next
birthday occasion. Annual occasions generate the next relevant year on sign-in,
while open, on returning to the tab and when reconnecting. **Plan next year** also
allows early planning. IDs are deterministic so concurrent phones/retries do not
create duplicate annual records. New years retain recipient/person references,
start with blank budgets and no new gift purchases/actions, and leave historical
gifts intact. Previous gifts are visible in each recipient's history. February 29
uses February 28 outside leap years. Records from earlier years remain selectable.

Calendar linking is explicit. It reuses a matching date/title or annual event,
or saves a deterministic yearly calendar event. Private occasions cannot be
published to the shared calendar. Existing events are never silently replaced.

## Sharing and privacy

New data is in these two documents, **not** inside `tasks/organiser`:

- `households/{householdId}/giftPlanners/shared`: verified household members.
- `households/{householdId}/giftPlanners/{uid}`: that verified member only.

**Household** and **Only me** are separate planners with independent occasions,
counts, actions and budgets. Choose Only me before creating an occasion for a
surprise. There is no client-side hiding of private fields in a shared record.
Other members cannot read, overwrite or enumerate private planner documents.
The UI clears planner state and editors on sign-out/session changes. Private
records never enter shared calendar entries, shopping metadata, organiser
backups, dashboard counts or notifications. This version supports owner-only
private planning, not a selected subset of collaborators. Moving gifts between
privacy scopes is intentionally unavailable; a gift already shared cannot be
made a secret retroactively.

Attachments live at
`households/{householdId}/giftPlanners/{plannerId}/{giftId}/{objectId}`.
Storage rules enforce the same membership/owner boundary, gift existence, content
types, immutable UUID filenames and size limits. Deleting a gift or sole recipient
removes gift records and attempts storage cleanup; if cleanup fails, the orphan
cannot be read without its gift record and an administrator can remove it later.
A duplicate does not reuse another gift's attachment path; reupload files if needed.

Planner edits use Firestore transactions and merge only fields changed by an
editor over the latest record. Action ticks update just that action. Deleted
records cannot be revived by stale edit forms. Existing organiser sync/outbox is
unchanged. Gift edits and file operations require a connection; a failed form save
keeps the editor open with an error. There is no separate gifts offline write queue.
Existing household offline task editing continues to work. Existing organiser
JSON exports remain unchanged and do not include the separate gift planners.

Each privacy scope currently uses a single Firestore document, subject to its
1 MiB limit. Binary files are stored separately in Storage. There is no background
server scheduler: annual generation runs when an authorised app session is active.

## Required security deployment and release order

**Neither live rules nor the live site are changed by this branch/PR.**

1. Run `npm ci --ignore-scripts`, `npm test`, `npm run test:rules` and
   `npm run test:browser` (install Playwright Chromium first).
2. Deploy both reviewed `firestore.rules` and `storage.rules` to the existing
   `home-organised` project. Preserve all existing membership and event rules.
   Firestore adds `giftPlanners` access without changing the original collections.
   Storage adds gift paths without changing event attachment paths.
3. The existing GitHub **Firebase rules** workflow deploys **Firestore only**,
   using its verify/live-hash/deploy process from `FIREBASE-DEPLOYMENT.md`.
   Deploy Storage through the Firebase Console or an authorised Firebase CLI:
   `firebase deploy --only storage --project home-organised`.
   Ensure the Storage rules service has the Firestore cross-service lookup
   permission described in `FIREBASE-DEPLOYMENT.md`; emulator success does not
   verify production IAM/CORS. Do not relax rules to resolve deployment problems.
4. Merge the reviewed PR, wait for GitHub Pages deployment, then run
   `python3 scripts/check-production.py --ref origin/main` to compare served files.
   The service-worker version includes all three gift modules. Installed users
   accept the existing update banner once other pending edits have synced.
5. On two authorised phones, verify shared recipients, tick/untick an action,
   upload/download a harmless voucher, check private planning from the other
   account, and confirm existing tasks, shopping, events and Add.

Until both rules are deployed, the Gifts screen can show a connection/access
error. The original organiser screens remain usable. Never report a branch/PR or
an emulator run as a verified live rollout.
