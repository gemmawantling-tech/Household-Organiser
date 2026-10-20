# Reserves usability and coverage upgrade

## Project inspected

Reserves is `Inventory/` in `gemmawantling-tech/Household-Organiser`.
It is a browser-local PWA with no Firebase SDK, account database or household
Firestore collection of its own. The separate root Home Organised application
uses Firebase Auth, Firestore and Storage. This change does not modify its code,
authentication, Firestore/Storage rules, deployment credentials or production data.

GitHub Pages is configured for the root of `main` (legacy branch publishing).
There is no build step for Reserves. Firebase rules have a separate manual
verify/deploy workflow and are not part of this release.

## Usability changes

The former dashboard led with a long generated recipe list. Navigation and
secondary links competed with stock entry; unknown pack sizes and water volumes
could look more certain than they were.

The new mobile shell uses labelled Dashboard, Inventory, Planner and Settings
navigation and a persistent Add item action. Dashboard leads with food and water
coverage, progress to a personal target, portions, dates, food groups and gaps.
Inventory has search, categories, status filters, sorting, editable item titles,
steppers, duplication, quantity undo and a bulk stock check. Secondary pantry,
target-review and backup tools remain in Settings.

Food records add servings, side/meal distinction, portion/pack size, preparation,
water requirement, meal occasion, estimated/manufacturer serving source, dietary
tags, optional price, protein and energy. Microwave rice suggests two estimated
portions; users must check the label. Photos are resized and saved locally, not
uploaded; storage failures keep the editor open. Barcode scanning uses the native
BarcodeDetector API when present, requests the camera only after a tap, stops on
close/cancel or after 30 seconds, and has manual entry. It does not look up products
or manufacture serving information.

## Coverage method and limits

The dashboard allocates only explicitly recorded complete meals and saved recipes
with a meal occasion and cooking requirement. Each batch deducts its required
quantities from a **simulation pool**, never real inventory. Duplicate ingredient
rows are summed. A complete meal stock line and a recipe using that line compete
for the same stock. Allocation favours the least-covered occasion, deterministically,
with a 10,000-batch cap. This is a conservative greedy estimate, not an optimal
solver or a nutritional assessment.

Food days = minimum tracked meal-occasion servings / adult-equivalent household
size. For three meals/day the occasions are breakfast/lunch/dinner; two means
lunch/dinner; one means dinner. Children use the household's adjustable portion
fraction. Example: four adults with 12 breakfasts, 8 lunches and 40 dinners have
**2 days**, limited by lunch. Forty rice packs with two **side** portions yield
**80 side portions and no complete meal days** until combined in recorded meals.

Missing meal metadata stays unverified; no complete meals shows a dash on the
headline. Previous name-based automatic recipe ideas remain available as
unverified alternatives, outside dashboard totals. Users can review an idea and
save an editable recipe. Legacy manual capacity is also shown as a separate
alternative, not added to dashboard totals.

Normal cooking assumes fuel and sufficient preparation water. Minimal heating
and no-cooking scenarios require matching explicit product and recipe preparation
fields and no added water. Preparation-water quantities and cooking-fuel supplies
are not jointly optimised. Protein and energy totals cover only entered values;
missing information remains unverified. Optional energy targets do not increase
food days or establish age-specific nutritional adequacy.

All adult/child dietary restrictions are conservatively applied to the shared
plan; it does not optimise separate diets. Dietary tags must be explicitly entered.
Foods marked unsuitable for children are excluded when children are present.

Use-by dates and unknown past dates are excluded. Past best-before food is excluded
until reviewed for planning by the user. Passing best-before alone is never called
unsafe. Rotation offers 30/90-day lists, past best-before and recently used stock.

## Water

Official source pages checked on 20 October 2026:
- https://prepare.campaign.gov.uk/get-prepared-for-emergencies/
- https://prepare.campaign.gov.uk/be-informed-about-hazards/water-supply-interruptions-or-outages/

UK Prepare describes emergency supplies for a few days and cites WHO figures:
2.5–3 L/person/day for drinking survival needs and 10 L for drinking, basic cooking
and hygiene. The app keeps these scenarios separate from the user's personal
(default 21-day) goal. Pet and special-needs allowances are added to daily use.

For four people at 3 L: **12 L/day; 36/84/252 L for 3/7/21 days**.
At 10 L: **40 L/day; 120/280/840 L** for the same periods.
252 L confirmed potable = 21 drinking days, or 6.3 days of basic needs.

Only records explicitly marked potable count towards coverage. Existing water
records without confirmation remain intact and appear as unverified volume.
Litres, millilitres, 500 ml bottles, 2 L bottles, 5 L containers and user-defined
multipacks convert to litres. Non-potable water is shown separately.

## Data preservation

No migration or seed runs. `home_reserves_inventory_v1`, existing IDs, quantities,
categories, recipes, settings and unknown fields are retained. New fields are
optional. Loading the upgrade does not rewrite the stored inventory. Browser-local
stock still does not sync between phones or become protected by Firebase login.
Concurrent-tab merging remains in place. Failed writes restore the saved in-memory
state and keep the user's form open, with an in-dialog error.

Tests use synthetic local records and the `demo-household-organiser` emulators.
They do not read or write production accounts or household documents. Actual
phone-local records cannot be remotely inspected from this workspace. Export a
JSON backup on the phone as a release check; preserve the existing site origin/path.

## Release checks

- `npm test`: existing checks plus portions, water conversions, shared allocations,
  meal balance, date/diet exclusions, stock adjustments and simulated planning.
- `npm run test:rules`: Firestore and Storage access controls in demo emulators.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`: existing mobile workflows
  and Pixel 7 emulation covering bulk entry, photo, portions, water, stock undo,
  planning, rotation, unknown-field preservation, quota failure and widths
  320/390/844/1280. Chromium emulation is not a physical Android device test.
- Inspect the mobile dashboard screenshot and check no horizontal overflow.

Physical Android camera permission/scanning, installed-PWA upgrade and actual
household data verification remain release checks. Barcode support varies by
browser. Native image decoding and local storage quota also vary by device.

Validation result: **69 unit tests, 12 emulator access-control tests and 4 browser
tests passed**. No production records were accessed or migrated.

## Publish and verify

Review/merge the prepared PR into `main` to use the existing GitHub Pages flow.
No Firebase rules deployment is required. After Pages succeeds, compare served
`Inventory/index.html`, `app.js`, `app.css`, `planner.js`, and `sw.js` against the
merged commit; `scripts/check-production.py --ref origin/main` checks the existing
asset set (check `Inventory/app.css` additionally). The Reserves service-worker
cache advances to v11. Open the same Reserves URL on Android, check saved stock,
export a backup, and verify food/water calculations and an add/use/undo round trip.
A pushed branch or successful PR checks alone does not mean the app is live.
