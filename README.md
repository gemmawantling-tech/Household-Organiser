# Household Organiser

Shared household tasks, routines, calendar and shopping, with a separate Home
Reserves inventory. The root organiser uses Firebase Authentication, Firestore
and private Storage attachments. Reserves keeps its existing browser-local data.

- [UX audit and implemented stages](docs/UX-AUDIT.md)
- [Release verification and recovery](docs/RELEASE-CHECKLIST.md)
- [Calendar attachments and required bucket checks](EVENT-ATTACHMENTS.md)
- [Firebase rules deployment](FIREBASE-DEPLOYMENT.md)
- [Carry-over and owner colours](CARRYOVER.md)
- [Home Reserves](Inventory/README.md)

Development: Node 24 and Java 21. Run `npm ci --ignore-scripts`, `npm test`,
`npm run test:rules` and `npm run test:browser` (install Chromium with
`npx playwright install chromium`). Emulator tests use a demo project; browser
account-level tests mock Firebase and never write production household data.

Production status is verified with actual served files using
`python3 scripts/check-production.py --ref origin/main`. A PR or successful test
run alone is not evidence that a feature is live. See the audit for outstanding
physical-device and authenticated production checks.
