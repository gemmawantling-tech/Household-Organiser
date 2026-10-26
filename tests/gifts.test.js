import { test } from "node:test";
import assert from "node:assert/strict";
import "../events.js";
import "../gifts-model.js";
const G = globalThis.HouseholdGifts;
function plan() {
  let d = G.empty();
  const put = (collection, id, patch) =>
    (d = G.apply(d, { kind: "put", collection, id, patch }));
  put("occasions", "christmas", {
    name: "Christmas",
    type: "Christmas",
    date: "2026-12-25",
    annual: true,
    budget: 50000,
  });
  put("recipients", "mum", {
    name: "Mum",
    personId: "person-mum",
    occasionId: "christmas",
    budget: 10000,
  });
  put("recipients", "dad", {
    name: "Dad",
    personId: "person-dad",
    occasionId: "christmas",
    budget: 10000,
  });
  put("gifts", "concert", {
    title: "Concert and dinner",
    occasionId: "christmas",
    recipientIds: ["mum", "dad"],
    type: "Experience",
    status: "Ordered / booked",
    cost: 18000,
    budget: 20000,
    actions: {
      print: {
        id: "print",
        text: "Print invitation",
        done: false,
        due: "2026-12-15",
      },
      card: { id: "card", text: "Put in Christmas card", done: true },
    },
  });
  return d;
}
test("recipient CRUD, multiple gifts, joint gift cost counted once", () => {
  let d = plan();
  d = G.apply(d, {
    kind: "put",
    collection: "recipients",
    id: "mum",
    before: d.recipients.mum,
    mustExist: true,
    patch: { name: "Mum & family" },
  });
  assert.equal(d.recipients.mum.name, "Mum & family");
  d = G.apply(d, { kind: "duplicate", id: "concert", newId: "copy" });
  assert.equal(
    G.values(d.gifts).filter((g) => g.recipientIds.includes("mum")).length,
    2,
  );
  assert.equal(G.summary(d, "christmas").spent, 18000);
  assert.equal(G.summary(d, "christmas").remaining, 32000);
  d = G.apply(d, { kind: "delete", collection: "recipients", id: "mum" });
  assert.deepEqual(d.gifts.concert.recipientIds, ["dad"]);
  d = G.apply(d, { kind: "delete", collection: "recipients", id: "dad" });
  assert.deepEqual(d.gifts, {});
});
test("booking is not organised; checked and unchecked actions update progress independently", () => {
  let d = plan();
  assert.equal(G.summary(d, "christmas").percent, 50);
  assert.equal(G.organised(d.gifts.concert), false);
  d = G.apply(d, {
    kind: "action",
    id: "concert",
    actionId: "print",
    done: true,
  });
  assert.equal(G.summary(d, "christmas").percent, 100);
  assert.equal(d.gifts.concert.status, "Ordered / booked");
  assert.equal(G.organised(d.gifts.concert), false);
  d = G.apply(d, {
    kind: "put",
    collection: "gifts",
    id: "concert",
    before: d.gifts.concert,
    patch: { status: "Ready to give" },
  });
  assert.equal(G.organised(d.gifts.concert), true);
  d = G.apply(d, {
    kind: "action",
    id: "concert",
    actionId: "card",
    done: false,
  });
  assert.equal(G.organised(d.gifts.concert), false);
  assert.equal(G.progress(d.gifts.concert).percent, 50);
});
test("budget rounding, optional amounts and unsafe links", () => {
  assert.equal(G.money("19.99"), 1999);
  assert.equal(G.money(""), null);
  assert.equal(G.money("0"), 0);
  for (const value of ["no", -1, Infinity]) assert.throws(() => G.money(value));
  assert.throws(() => G.safeLink("javascript:alert(1)"));
  assert.throws(() => G.safeLink("data:text/html,test"));
  assert.equal(G.safeLink("https://example.com"), "https://example.com/");
});
test("annual rollover is idempotent, keeps history and copies people with fresh budgets", () => {
  const d = plan(),
    next = G.ensureAnnual(d, "2027-01-01");
  assert.ok(next.changed);
  assert.equal(next.data.occasions["christmas-2027"].budget, null);
  assert.equal(next.data.recipients["christmas-2027-person-mum"].budget, null);
  assert.equal(
    next.data.recipients["christmas-2027-person-mum"].personId,
    "person-mum",
  );
  assert.deepEqual(next.data.gifts, d.gifts);
  assert.deepEqual(next.data.occasions.christmas, d.occasions.christmas);
  assert.equal(G.ensureAnnual(next.data, "2027-01-01").changed, false);
  assert.equal(G.dateInYear("2000-02-29", 2027), "2027-02-28");
  assert.equal(G.dateInYear("2000-02-29", 2028), "2028-02-29");
});
test("duplicate resets purchase and completion, move retains one cost and maps recipients", () => {
  let d = plan();
  d.gifts.concert.attachments = { one: { objectId: "one" } };
  d = G.apply(d, { kind: "duplicate", id: "concert", newId: "copy" });
  assert.equal(d.gifts.copy.status, "Not started");
  assert.equal(d.gifts.copy.cost, null);
  assert.equal(d.gifts.copy.actions.card.done, false);
  assert.deepEqual(d.gifts.copy.attachments, {});
  d = G.apply(d, {
    kind: "put",
    collection: "occasions",
    id: "birthday",
    patch: { name: "Birthday", type: "Birthday", date: "2026-11-10" },
  });
  d = G.apply(d, { kind: "move", id: "concert", occasionId: "birthday" });
  assert.equal(G.summary(d, "christmas").spent, 0);
  assert.equal(G.summary(d, "birthday").spent, 18000);
  assert.equal(d.gifts.concert.recipientIds.length, 2);
  assert.equal(d.gifts.concert.attachments.one.objectId, "one");
});
test("concurrent editor changes preserve other phone action ticks, files and unknown fields", () => {
  const before = plan().gifts.concert;
  let d = plan();
  d = G.apply(d, {
    kind: "action",
    id: "concert",
    actionId: "print",
    done: true,
  });
  d.gifts.concert.future = "keep";
  d = G.apply(d, {
    kind: "attachment",
    id: "concert",
    attachment: { objectId: "voucher", name: "voucher.pdf" },
  });
  d = G.apply(d, {
    kind: "put",
    collection: "gifts",
    id: "concert",
    before,
    mustExist: true,
    patch: { title: "Evening out", actions: before.actions },
  });
  assert.equal(d.gifts.concert.actions.print.done, true);
  assert.equal(d.gifts.concert.future, "keep");
  assert.ok(d.gifts.concert.attachments.voucher);
  d = G.apply(d, { kind: "delete", collection: "gifts", id: "concert" });
  assert.throws(
    () =>
      G.apply(d, {
        kind: "put",
        collection: "gifts",
        id: "concert",
        before,
        mustExist: true,
        patch: { title: "Old form" },
      }),
    /deleted/,
  );
});
test("outstanding actions sorted by urgency, reminders work without a due date", () => {
  const d = plan();
  d.gifts.concert.actions = {
    a: { id: "a", text: "Later", done: false, due: "2026-12-24" },
    b: { id: "b", text: "Overdue", done: false, due: "2026-10-01" },
    c: { id: "c", text: "This week", done: false, due: "2026-10-30" },
    d: { id: "d", text: "Prompt", done: false, reminder: "2026-10-20" },
    e: { id: "e", text: "Done", done: true, due: "2026-01-01" },
  };
  assert.deepEqual(
    G.outstanding(d, "2026-10-26").map((a) => a.urgency),
    ["Overdue", "Reminder", "Next seven days", "Later"],
  );
});
test("batch adds birthday and recipient atomically without touching organiser data", () => {
  const existing = {
    shopping: { weekly: [{ id: "milk", text: "Milk" }] },
    events: [{ id: "party" }],
    custom: { keep: true },
  };
  const original = structuredClone(existing);
  const d = G.apply(G.empty(), {
    kind: "batch",
    commands: [
      {
        kind: "put",
        collection: "people",
        id: "mum",
        patch: { name: "Mum", birthday: "1960-02-29" },
      },
      {
        kind: "put",
        collection: "occasions",
        id: "birthday",
        patch: { name: "Mum birthday", date: "2027-02-28", annual: true },
      },
      {
        kind: "put",
        collection: "recipients",
        id: "mum-birthday",
        patch: { name: "Mum", personId: "mum", occasionId: "birthday" },
      },
    ],
  });
  assert.equal(d.people.mum.birthday, "1960-02-29");
  assert.deepEqual(existing, original);
  assert.equal(
    G.values(G.ensureAnnual(d, "2027-03-01").data.occasions).length,
    2,
  );
});
