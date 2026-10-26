import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  runTransaction,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getBytes,
  deleteObject,
  updateMetadata,
} from "firebase/storage";
import { installGifts } from "../gifts-service.js";
import "../events.js";
import "../gifts-model.js";
const G = globalThis.HouseholdGifts,
  hid = "gifts-household";
let env;
const db = (uid, verified = true) =>
  env
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      email_verified: verified,
    })
    .firestore();
const store = (uid, verified = true) =>
  env.authenticatedContext(uid, { email_verified: verified }).storage();
const target = (d, scope = "shared") =>
  doc(d, "households", hid, "giftPlanners", scope);
const content = () =>
  G.apply(G.empty(), {
    kind: "batch",
    commands: [
      {
        kind: "put",
        collection: "occasions",
        id: "christmas",
        patch: {
          name: "Christmas",
          type: "Christmas",
          date: "2026-12-25",
          annual: true,
          budget: 30000,
        },
      },
      {
        kind: "put",
        collection: "recipients",
        id: "mum",
        patch: { name: "Mum", occasionId: "christmas" },
      },
      {
        kind: "put",
        collection: "gifts",
        id: "concert",
        patch: {
          title: "Surprise concert",
          occasionId: "christmas",
          recipientIds: ["mum"],
          status: "Ordered / booked",
          type: "Experience",
          cost: 10000,
          actions: {
            print: { id: "print", text: "Print voucher", done: false },
          },
        },
      },
    ],
  });
const objectId = "11111111-1111-4111-8111-111111111111";
const path = (scope = "shared", gift = "concert", oid = objectId) =>
  `households/${hid}/giftPlanners/${scope}/${gift}/${oid}`;
const upload = (
  uid,
  scope = "shared",
  type = "application/pdf",
  size = 8,
  p = path(scope),
) =>
  uploadBytes(ref(store(uid), p), new Uint8Array(size), { contentType: type });
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-household-organiser",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
  await env.withSecurityRulesDisabled(async (c) => {
    for (const uid of ["gemma", "ben"])
      await setDoc(doc(c.firestore(), "households", hid, "members", uid), {
        uid,
      });
    await setDoc(doc(c.firestore(), "households", hid, "tasks", "organiser"), {
      data: {
        shopping: { weekly: [{ id: "milk", text: "Milk" }] },
        events: [{ id: "party" }],
        custom: { keep: true },
      },
    });
  });
});
after(async () => env?.cleanup());
test("shared planner syncs for both members; private plans cannot be read, written or enumerated by others", async () => {
  await assertSucceeds(
    setDoc(target(db("gemma")), {
      data: content(),
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    setDoc(target(db("gemma"), "gemma"), {
      data: content(),
      updatedAt: serverTimestamp(),
    }),
  );
  assert.equal(
    (await assertSucceeds(getDoc(target(db("ben"))))).data().data.gifts.concert
      .title,
    "Surprise concert",
  );
  for (const uid of ["ben", "outsider"]) {
    await assertFails(getDoc(target(db(uid), "gemma")));
    await assertFails(
      setDoc(target(db(uid), "gemma"), {
        data: G.empty(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      getDocs(collection(db(uid), "households", hid, "giftPlanners")),
    );
  }
  await assertFails(getDoc(target(db("outsider"))));
  await assertFails(getDoc(target(db("gemma", false))));
  await assertFails(getDoc(target(env.unauthenticatedContext().firestore())));
});
test("concurrent real transactions keep action, title and attachment edits from both phones", async () => {
  const before = content().gifts.concert;
  const write = (uid, command) => {
    const d = db(uid);
    return runTransaction(d, async (tx) => {
      const t = target(d),
        snap = await tx.get(t);
      tx.set(t, {
        data: G.apply(snap.data().data, command),
        updatedAt: serverTimestamp(),
      });
    });
  };
  await Promise.all([
    write("gemma", {
      kind: "action",
      id: "concert",
      actionId: "print",
      done: true,
    }),
    write("ben", {
      kind: "put",
      collection: "gifts",
      id: "concert",
      before,
      mustExist: true,
      patch: { title: "Concert & dinner" },
    }),
  ]);
  await write("ben", {
    kind: "attachment",
    id: "concert",
    attachment: { objectId, name: "voucher.pdf" },
  });
  const result = (await getDoc(target(db("gemma")))).data().data;
  assert.equal(result.gifts.concert.actions.print.done, true);
  assert.equal(result.gifts.concert.title, "Concert & dinner");
  assert.equal(result.gifts.concert.attachments[objectId].name, "voucher.pdf");
  const legacy = (
    await getDoc(doc(db("gemma"), "households", hid, "tasks", "organiser"))
  ).data().data;
  assert.equal(legacy.shopping.weekly[0].text, "Milk");
  assert.equal(legacy.events[0].id, "party");
  assert.equal(legacy.custom.keep, true);
});
test("secure shared and private attachment uploads, downloads and deletion", async () => {
  await assertSucceeds(upload("gemma"));
  await assertSucceeds(getBytes(ref(store("ben"), path())));
  await assertSucceeds(upload("gemma", "gemma"));
  await assertSucceeds(getBytes(ref(store("gemma"), path("gemma"))));
  for (const uid of ["ben", "outsider"]) {
    await assertFails(getBytes(ref(store(uid), path("gemma"))));
    await assertFails(upload(uid, "gemma"));
    await assertFails(deleteObject(ref(store(uid), path("gemma"))));
  }
  await assertFails(getBytes(ref(store("gemma", false), path())));
  await assertFails(
    getBytes(ref(env.unauthenticatedContext().storage(), path())),
  );
  await assertSucceeds(deleteObject(ref(store("ben"), path())));
});
test("deny unbound gifts, active content, replacement, bad paths and oversized attachments", async () => {
  await assertFails(
    upload("gemma", "shared", "application/pdf", 8, path("shared", "missing")),
  );
  await assertFails(upload("gemma", "shared", "text/html"));
  await assertFails(upload("gemma", "shared", "application/pdf", 10485761));
  await assertFails(upload("gemma", "shared", "application/pdf", 0));
  await assertFails(
    upload(
      "gemma",
      "shared",
      "application/pdf",
      8,
      path("shared", "concert", "ticket.pdf"),
    ),
  );
  await assertFails(upload("gemma", "gemma"));
  await assertFails(
    updateMetadata(ref(store("gemma"), path("gemma")), {
      contentType: "text/html",
    }),
  );
});
test("planner documents reject unrelated fields and unverified writes", async () => {
  await assertFails(
    setDoc(target(db("gemma")), {
      data: { ...content(), shopping: { leak: true } },
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(target(db("gemma", false)), {
      data: content(),
      updatedAt: serverTimestamp(),
    }),
  );
});

test("planner service shares live changes between phones and clears private state on disconnect", async () => {
  const make = (uid) =>
    installGifts({
      db: db(uid),
      storage: store(uid),
      auth: { currentUser: { uid, emailVerified: true } },
      doc,
      onSnapshot,
      runTransaction,
      serverTimestamp,
      ref,
      uploadBytes,
      getBlob: getBytes,
      deleteObject,
    });
  const a = make("gemma"),
    b = make("ben");
  const wait = (api, condition) =>
    new Promise((resolve, reject) => {
      let stop = () => {},
        timer = setTimeout(() => {
          stop();
          reject(Error("Planner snapshot timed out"));
        }, 6000);
      stop = api.subscribe((s) => {
        if (condition(s)) {
          clearTimeout(timer);
          queueMicrotask(() => {
            stop();
            resolve(s);
          });
        }
      });
    });
  try {
    a.connect(hid, "gemma");
    b.connect(hid, "ben");
    await Promise.all([
      wait(a, (s) => s.ready.shared && s.ready.private),
      wait(b, (s) => s.ready.shared && s.ready.private),
    ]);
    assert.ok(a.snapshot.private.gifts.concert);
    assert.equal(b.snapshot.private.gifts.concert, undefined);
    const original = a.snapshot.shared.gifts.concert;
    await Promise.all([
      a.change("shared", {
        kind: "action",
        id: "concert",
        actionId: "print",
        done: false,
      }),
      b.change("shared", {
        kind: "put",
        collection: "gifts",
        id: "concert",
        before: original,
        mustExist: true,
        patch: { notes: "Ben confirmed the reservation" },
      }),
    ]);
    await wait(
      a,
      (s) =>
        s.shared.gifts.concert.notes === "Ben confirmed the reservation" &&
        !s.shared.gifts.concert.actions.print.done,
    );
    await wait(
      b,
      (s) =>
        s.shared.gifts.concert.notes === "Ben confirmed the reservation" &&
        !s.shared.gifts.concert.actions.print.done,
    );
    a.disconnect();
    assert.equal(a.snapshot.uid, null);
    assert.deepEqual(a.snapshot.private, G.empty());
    assert.deepEqual(a.snapshot.shared, G.empty());
    await assert.rejects(
      a.change("shared", { kind: "annual", today: "2027-01-01" }),
      /Sign in/,
    );
  } finally {
    a.disconnect();
    b.disconnect();
  }
});
