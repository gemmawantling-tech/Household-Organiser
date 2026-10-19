# Household Organiser: audit and staged improvement

Audit date: 19 October 2026. Baseline: `507bd410b078594d7c9c309af2c2c102fd02ca6b`.
This report distinguishes implemented/tested work from production verification.

## Production evidence

The public production files were downloaded with cache revalidation and compared
byte-for-byte against `origin/main`. All 14 existing files in the release checker
matched. The six new modules/styles in this change were absent from that baseline,
as expected. This includes the original organiser, its event/invitation helpers,
worker/manifest, the earlier Family screen and the Reserves pages/scripts.

The read-only Firebase workflow run
[39321784137](https://github.com/gemmawantling-tech/Household-Organiser/actions/runs/39321784137)
succeeded. The live Firestore rules fingerprint is
`33d8de9ee1c8881b6b2e912e980bd652571b7d2828f7c520f83132d6463d0537`.
It exactly matches the no-trailing-newline rules text reviewed and published in
this conversation. Removing comments and formatting from that reviewed text and
repository `firestore.rules` gives the same policy. The different repository
fingerprint is therefore formatting/comments, not a discovered permission change.
No production rules, household documents, memberships, attachments or CORS settings
were changed during this audit. Storage's deployed policy, bucket IAM and CORS
remain unverified; emulator coverage must not be presented as a live bucket test.

**These UX changes are not live merely because this branch/PR exists.** After
release, run `python3 scripts/check-production.py --ref origin/main` and perform
the account/device checks in RELEASE-CHECKLIST.md before marking them deployed.

## Application map and findings

| Area | Existing issue | Action/status |
| --- | --- | --- |
| Root organiser | Duplicate add buttons, long competing sections, dated jobs lost from today's view | One main Add sheet, Today/Calendar/Lists/More navigation, outstanding-first tasks, collapsed completed/routine/planning sections; pending carry-over retained |
| Calendar | No day/week/month switcher, events not assigned to people | Added views, stable recurring occurrences, member assignment and coloured labels; existing event editor/attachments reused |
| Task editing | Browser prompt, small crowded edit/delete targets, labels not associated with checkboxes | Existing dialog reused for title/owner edits, options menu and checkbox labels; existing schedule retained |
| Ownership | Names alone, inconsistent emphasis | Purple Gemma, blue Ben, amber Shared; visible text retained and selected filters outlined |
| Firebase task sync | Transaction failures could leave local state without a durable retry queue | Per-user/per-household per-operation journal with idempotent deltas, retry, status, storage-error and blocked-permission states |
| Concurrent writes | Existing single-document server merge protects events; queued overlays needed protection too | Keep remote events/attachments and overlay outstanding local changes; test slow/offline/concurrent writes |
| Authentication | Connection errors looked like first-time household setup | Separate connection/retry screen; scoped cache marker prevents using a previous household cache to seed a new household |
| Sharing | Bearer invites have no expiry | Existing verified/member rules retained; added owner-only link replacement using the current allowed inviteCode update; existing members keep access |
| Offline | Worker omitted Firebase SDK scripts and several shell resources | Cache the public app shell and versioned SDK modules only, Firestore IndexedDB persistence, explicit limitations if unavailable |
| Updates | Forced worker activation, unreliable refresh semantics | Waiting worker/update banner; refuse update while a dialog or pending edits need attention; network timeout and cached shell fallback |
| Worker scope | Root controls can reach other apps on the same origin | Root cache allowlist excludes Family and Inventory pages and all private Firestore/Storage requests |
| Recovery | Import could replace the shared state without a saved prior snapshot | Explicit household-wide confirmation, shape/size validation and scoped pre-import snapshot downloads |
| Earlier Family app | Non-atomic create/join incompatible with deployed rules; aggregate organiser appeared as a blank task | Reuse shared atomic invitation helpers; exclude organiser aggregate from its collection view; keep legacy records separate and link clearly to root |
| Home Reserves | Weak meal combinations, plain staples counted as meals | Retained pending recipe correction and source links; fuller combinations use counted ingredients |
| Pantry view | Tapping an item opened only the stock tab | Item-specific deep link opens the correct edit dialog |
| 21-day review | Stale snapshot could overwrite newer inventory; target units could be misapplied | Re-read current inventory before saving, only change the selected optimum; mismatched units require a manually reviewed value |
| Reserves multi-tab edits | Whole old snapshot could overwrite another tab's unrelated edits | Reuse existing field/ID merge helper, refresh inactive forms through storage events, preserve unknown record fields |
| Duplicate root app.js/app.css | Older Inventory implementation remains at the repository root but isn't loaded by root index.html | Audited, left intact; use Inventory/ for stock changes, not these unused copies |
| CI | UI asset changes could miss checks; deprecated action runtimes | Broader app-file triggers and immutable pins to Node-24-based action versions |

The Family app and Reserves keep their existing data stores. They have not been
silently combined into the original organiser. Reserves is still browser-local;
it is not Firebase-synchronised. No sample stock quantities are inserted.

## Stages delivered in the review branch

1. Preserve the meal correction, unfinished dated jobs and owner colours from
   pending changes (#8/#9), without merging them individually into production.
2. Repair legacy onboarding and stock-view consistency before layering on new UX.
3. Add the dashboard/navigation/calendar presentation and assignment, using the
   existing DOM/data paths rather than replacing the application or database.
4. Add durable offline syncing, safe updates, recovery checks and regression tests.
5. Document actual production baseline and a repeatable verification/release process.

## Verification and honest limits

- Unit suite: 59 tests, including dates/recurrence, carry-over, invitation joining,
  deployment safeguards, recipe allocation, conflict merging, outbox restart,
  quota/permission failures, independent tab journals/serialized flushing, safe legacy queue recovery and worker cache isolation.
- Firestore/Storage emulators: 12 tests against `demo-household-organiser` only.
  Verified members, wrong/rotated invitations, forged roles, cross-household reads,
  protected attachment paths/types/sizes owner rotation and two-client transaction merging are covered.
- Browser integration: mobile event editing/assignment/recurrence/attachments,
  carry-over/owner colours, offline queued edits with a concurrent event, calendar
  navigation, audit, warm-worker offline reopening at 320px, and Reserves deep
  links/stock preservation. Firebase traffic is mocked in account-level scenarios.
- Screenshots reviewed at 390px mobile and 1280px desktop. Horizontal overflow is
  checked at 320px. Native buttons/labels, visible focus, named controls, contrast
  palettes and minimum action sizes are retained; this is not a completed screen
  reader or third-party accessibility certification.
- A physical Android Chrome device and an actually installed Android PWA are not
  available to this environment. Desktop Chromium mobile emulation and a real
  service worker are tested; final physical-device acceptance remains required.
- Real-account attachment upload/download and two-phone production sync require
  the owner's accounts and verified bucket setup. No production test records were
  created on the user's behalf.

## Remaining product work before offering it to unrelated families

- Replace fixed Gemma/Ben labels and seed routines with household configuration.
- The original organiser is one Firestore document (1 MiB maximum). A separately
  reviewed, reversible per-task/event storage migration is needed before large
  household histories; this release intentionally avoids such a migration.
- Invitation links remain shareable bearer links without expiry or an email-bound
  recipient. Rotation is available; one-time expiring invites need a separate
  invitation model/backend.
- Calendar operations and attachment uploads/downloads require connectivity.
  Offline task/shopping edits can sync after reopening the same account; sign-in
  or a first-ever household load still needs a connection.
- Simultaneous changes to the same field use the last successful save. Reserves
  localStorage merging protects unrelated changes but is not a multi-tab database
  transaction or cross-device sync.
- Recurring edits apply to the whole series; per-occurrence exceptions/end dates
  and attachment orphan-retention tools remain separate work. Files are retained
  when an event is deleted to avoid irreversible file deletion.

Chrome/PWA views on the same device journal operations independently and use Web Locks to serialize flushing. Browsers without Web Locks should use one editing tab at a time; unrelated-field merges still apply.
