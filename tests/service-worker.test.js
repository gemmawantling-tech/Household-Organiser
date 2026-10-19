import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
function worker() {
  const handlers = {},
    saved = new Map();
  let offline = false,
    activated = false,
    requests = 0;
  const root = "https://example.test/Household-Organiser/";
  const key = (x) => (typeof x === "string" ? new URL(x, root).href : x.url);
  const cache = {
    addAll: async (paths) =>
      paths.forEach((path) =>
        saved.set(key(path), new Response("cached " + path)),
      ),
    match: async (value) => saved.get(key(value))?.clone(),
    put: async (value, response) => saved.set(key(value), response),
  };
  const context = vm.createContext({
    URL,
    AbortSignal,
    Promise,
    Set,
    self: {
      location: { href: root + "sw.js" },
      clients: { claim: async () => {} },
      skipWaiting: () => (activated = true),
      addEventListener: (type, handler) => (handlers[type] = handler),
    },
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
    },
    fetch: async () => {
      requests++;
      if (offline) throw Error("Offline");
      return new Response("network");
    },
  });
  vm.runInContext(readFileSync("sw.js", "utf8"), context);
  return {
    handlers,
    saved,
    setOffline: (value) => (offline = value),
    get requests() {
      return requests;
    },
    get activated() {
      return activated;
    },
    request: async (url) => {
      let response;
      handlers.fetch({
        request: new Request(url),
        respondWith: (promise) => (response = promise),
      });
      return response ? await response : null;
    },
  };
}
test("warm app shell reopens offline and query strings do not create stale shell copies", async () => {
  const w = worker();
  let installing;
  w.handlers.install({ waitUntil: (p) => (installing = p) });
  await installing;
  w.setOffline(true);
  const response = await w.request(
    "https://example.test/Household-Organiser/?new=1",
  );
  assert.equal(await response.text(), "cached ./");
  const script = await w.request(
    "https://example.test/Household-Organiser/ui.js",
  );
  assert.equal(await script.text(), "cached ./ui.js");
});
test("only public shell and immutable Firebase scripts are cached; other apps and private requests bypass it", async () => {
  const w = worker();
  for (const url of [
    "https://firestore.googleapis.com/v1/documents",
    "https://firebasestorage.googleapis.com/v0/b/private/o/ticket",
    "https://example.test/Household-Organiser/Inventory/",
    "https://example.test/Household-Organiser/Family/",
    "https://example.test/Household-Organiser/private.pdf",
  ])
    assert.equal(await w.request(url), null);
  assert.equal(w.saved.size, 0);
  const sdk = "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
  await w.request(sdk);
  w.setOffline(true);
  assert.equal(await (await w.request(sdk)).text(), "network");
  assert.equal(w.requests, 1);
});
test("new worker does not activate until an explicit update message", async () => {
  const w = worker();
  w.handlers.install({ waitUntil: () => {} });
  assert.equal(w.activated, false);
  w.handlers.message({ data: { type: "ACTIVATE_UPDATE" } });
  assert.equal(w.activated, true);
});
