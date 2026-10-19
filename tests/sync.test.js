import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const c = vm.createContext({ console, setTimeout, clearTimeout });
for (const file of ["events.js", "sync.js"])
  vm.runInContext(readFileSync(file, "utf8"), c);
const storage = () => {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, v),
  };
};
const base = () => ({
  completed: {},
  events: [
    { id: "legacy", title: "Keep", attachments: [{ objectId: "ticket" }] },
  ],
  custom: {},
});
const merge = c.HouseholdEvents.mergeChanges,
  create = c.HouseholdOutbox.create;
test("offline task deltas persist, restore and merge over concurrent events without copies", async () => {
  const store = storage(),
    before = base(),
    after = { ...before, completed: { task: true } };
  let online = false,
    remote = base(),
    writes = 0;
  const options = {
    storage: store,
    key: "house:gemma",
    merge,
    online: () => online,
    write: async (op) => {
      writes++;
      return (remote = merge(remote, op.before, op.after));
    },
  };
  let q = create(options);
  q.enqueue(before, after);
  assert.equal(q.pending, 1);
  assert.equal(writes, 0);
  q.close();
  remote.events.push({ id: "ben", title: "New event" });
  q = create(options);
  assert.equal(q.pending, 1);
  assert.equal(q.overlay(remote).events.length, 2);
  online = true;
  await q.flush();
  assert.equal(q.pending, 0);
  assert.equal(remote.completed.task, true);
  assert.equal(remote.events.length, 2);
  assert.equal(remote.events[0].attachments[0].objectId, "ticket");
  q.close();
});
test("failed writes remain durable and retry succeeds without duplicate records", async () => {
  let fail = true,
    writes = 0;
  const before = base(),
    after = { ...before, custom: { date: [{ id: "one", text: "One task" }] } };
  let server = base();
  const q = create({
    storage: storage(),
    key: "x",
    merge,
    write: async (op) => {
      writes++;
      if (fail) throw Error("Network");
      return (server = merge(server, op.before, op.after));
    },
  });
  q.enqueue(before, after);
  await q.flush();
  assert.equal(q.pending, 1);
  fail = false;
  await q.flush();
  assert.equal(q.pending, 0);
  assert.equal(server.custom.date.length, 1);
  assert.equal(writes, 2);
  q.close();
});
test("outboxes are isolated by household and user; storage failure is never reported as safely saved", async () => {
  const store = storage(),
    q = create({
      storage: store,
      key: "a:gemma",
      merge,
      online: () => false,
      write: async () => base(),
    });
  q.enqueue(base(), { ...base(), completed: { a: true } });
  const other = create({
    storage: store,
    key: "b:ben",
    merge,
    write: async () => base(),
  });
  assert.equal(other.pending, 0);
  const statuses = [],
    full = create({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw Error("Quota");
        },
      },
      key: "full",
      merge,
      online: () => false,
      write: async () => base(),
      onStatus: (s) => statuses.push(s),
    });
  full.enqueue(base(), { ...base(), completed: { a: true } });
  assert.equal(full.durable, false);
  assert.equal(statuses.at(-1), "storage");
  for (const x of [q, other, full]) x.close();
});
test("corrupt outbox blocks silent replacement and signals recovery", () => {
  assert.throws(
    () =>
      create({
        storage: { getItem: () => "{bad" },
        key: "x",
        merge,
        write: async () => base(),
      }),
    /Pending changes could not be read/,
  );
});
test("attachment retry uses one stable object reference", () => {
  const events = [{ id: "e", attachments: [{ objectId: "a", name: "Old" }] }];
  const result = c.HouseholdEvents.patchEvent(
    events,
    "e",
    {},
    { objectId: "a", name: "New" },
  );
  assert.equal(result[0].attachments.length, 1);
  assert.equal(events[0].attachments[0].name, "Old");
});
test("permanent permission errors keep changes and report a block rather than a network retry", async () => {
  const statuses = [],
    q = create({
      storage: storage(),
      key: "blocked",
      merge,
      write: async () => {
        throw Object.assign(Error("Denied"), { code: "permission-denied" });
      },
      onStatus: (s) => statuses.push(s),
    });
  q.enqueue(base(), { ...base(), completed: { a: true } });
  await q.flush();
  assert.equal(q.pending, 1);
  assert.equal(statuses.at(-1), "blocked");
  q.close();
});
test("slow writes keep newer local edits and concurrent remote data until both changes are acknowledged", async () => {
  const initial = base(),
    first = { ...initial, completed: { a: true } },
    second = { ...first, completed: { a: true, b: true } };
  let remote = base(),
    release;
  const gate = new Promise((resolve) => (release = resolve));
  let count = 0;
  const q = create({
    storage: storage(),
    key: "slow",
    merge,
    write: async (op) => {
      if (++count === 1) await gate;
      return (remote = merge(remote, op.before, op.after));
    },
  });
  q.enqueue(initial, first);
  q.enqueue(first, second);
  assert.equal(q.pending, 2);
  remote.events.push({ id: "other-phone", title: "New booking" });
  release();
  await q.flush();
  assert.equal(q.pending, 0);
  assert.equal(remote.completed.a, true);
  assert.equal(remote.completed.b, true);
  assert.equal(remote.events.length, 2);
  q.close();
});
