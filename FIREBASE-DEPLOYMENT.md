# Firebase rules updates

The **Firebase rules** GitHub Actions workflow replaces manual copying into the
Firebase console. Application updates still publish through the existing GitHub
Pages workflow. No frontend or live rules changes are included in this setup.

## Normal use

1. Prepare a pull request with the intended rules changes and review it. The
   workflow runs invitation, deployment and Firestore emulator tests without
   production credentials. Merge the reviewed change.
2. In GitHub **Actions → Firebase rules → Run workflow**, choose branch **main**
   and operation **verify**. This tests the rules and checks Google access with
   GET requests to the Firebase Rules API. It does not publish anything.
3. Review the rules change and verification summary. To publish, run the workflow
   again on **main**, choose **deploy**, and paste the live rules SHA-256 from the
   verification summary into **expected_live_sha256**. This is a fingerprint,
   not a password. Tests run again before sign-in. If the live rules changed
   since verification, publishing stops. The source deployed is the `firestore.rules`
   in the workflow run's checked-out commit; confirm that commit is the one reviewed.

Merging alone never deploys Firebase rules. The initial verify run must succeed
before the connection can be considered tested. If it reports an API-disabled
error, a project administrator must enable the named API in Google Cloud and
rerun verify; do not add broad roles to work around it.

## Connection and permissions

- Project: `home-organised` (number `966435670170`).
- Pool/provider: `github-household` / `github`.
- Issuer: `https://token.actions.githubusercontent.com`.
- Mapping: `google.subject = assertion.sub`.
- Provider condition restricts repository ID `1423673602`, owner ID `344082632`,
  and ref `refs/heads/main`.
- Service account: `github-firebase-rules@home-organised.iam.gserviceaccount.com`.
- Project role: **Firebase Rules Admin**, without a Firestore document data role.
- Account impersonation binding: **Workload Identity User** for subject
  `repo:gemmawantling-tech@344082632/Household-Organiser@1423673602:ref:refs/heads/main` in that pool.
- No JSON private keys, Firebase CLI login token, GitHub secret, or downloaded
  credential file is needed. GitHub requests a ten-minute Google access token.

Rules Admin can change the permissions protecting data, so only trusted
contributors should be allowed to merge or change workflows on main. The subject
binding is main-branch based: adding a GitHub Actions environment changes the OIDC
subject and requires reviewing/updating that binding. It must not be broadened to
all pool identities. PRs have no ID-token permission and cannot access Google.

## Data preservation and recovery

The script calls only the Firebase Rules API, not the Firestore document API.
It cannot seed, migrate, delete or overwrite household documents. A rules change
can still alter access; tests and human review remain necessary. Existing data
and access depend on the rules you choose to publish.

The run summary records the previous ruleset name. Google retains previous rule
versions, available in the Firebase console's rules history, to support rollback.
The script rereads the release before switching it, but the Rules API offers no
atomic compare-and-swap operation. Avoid concurrent console deployments while
this workflow is publishing. GitHub workflow runs are serialized for main.

Run `npm ci --ignore-scripts`, `npm test`, and `npm run test:rules` locally (Node 24,
Java 21). Emulator tests use only `demo-household-organiser`. Dependency versions
are locked, and GitHub Actions are pinned to immutable commits.

## Event attachment Storage rules

The event attachment feature adds `storage.rules` and Storage emulator tests.
The workflow above still verifies/deploys **Firestore only**, and never deploys
Storage automatically. See [EVENT-ATTACHMENTS.md](EVENT-ATTACHMENTS.md) for the
manual Storage permissions, service-agent, CORS and approval steps. No Firestore
rule change is needed for this feature.
