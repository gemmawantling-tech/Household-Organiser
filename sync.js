/* Immutable per-operation journal; a browser lock serialises shared-tab flushes. */
(function (root) {
  function create({
    storage,
    key,
    merge,
    write,
    onState = () => {},
    onStatus = () => {},
    online = () => true,
    lock = (fn) => fn(),
    retryMs = 15000,
  }) {
    const prefix = key + "/";
    let volatile = [],
      running = null,
      closed = false,
      timer = null,
      sequence = 0;
    const valid = (op) =>
      op &&
      op.before &&
      op.after &&
      typeof op.before === "object" &&
      typeof op.after === "object";
    function entries() {
      const result = [];
      for (let i = 0; i < storage.length; i++) {
        const name = storage.key(i);
        if (!name?.startsWith(prefix)) continue;
        const op = JSON.parse(storage.getItem(name));
        if (!valid(op) || typeof op.id !== "string")
          throw Error("Invalid pending data");
        result.push({ ...op, journalKey: name });
      }
      return [...result, ...volatile].sort(
        (a, b) =>
          (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id),
      );
    }
    try {
      // Older versions stored an array. Copy every entry before removing it;
      // stable migration keys are safe if two tabs restore the same old queue.
      const old = storage.getItem(key);
      if (old) {
        const ops = JSON.parse(old);
        if (!Array.isArray(ops) || ops.some((op) => !valid(op)))
          throw Error("Invalid pending data");
        for (let i = 0; i < ops.length; i++) {
          const name = prefix + "legacy-" + i;
          if (!storage.getItem(name))
            storage.setItem(
              name,
              JSON.stringify({
                ...ops[i],
                id: "legacy-" + String(i).padStart(8, "0"),
                createdAt: i,
              }),
            );
        }
        storage.removeItem(key);
      }
      entries();
    } catch (error) {
      onStatus("recovery", error);
      throw Error(
        "Pending changes could not be read. Preserve browser data before recovery.",
      );
    }
    const durable = () => volatile.length === 0;
    const overlay = (remote) =>
      entries().reduce((data, op) => merge(data, op.before, op.after), remote);
    function status() {
      const count = entries().length;
      onStatus(
        !durable()
          ? "storage"
          : count
            ? online()
              ? "pending"
              : "offline"
            : online()
              ? "saved"
              : "offline",
        null,
        count,
      );
    }
    function schedule() {
      if (!closed && !timer && entries().length) {
        timer = setTimeout(() => {
          timer = null;
          flush();
        }, retryMs);
        timer.unref?.();
      }
    }
    async function run() {
      if (closed || !online()) {
        status();
        return;
      }
      while (!closed) {
        const op = entries()[0];
        if (!op) {
          status();
          return;
        }
        try {
          const remote = await write(op);
          if (closed) return;
          if (op.journalKey) storage.removeItem(op.journalKey);
          else volatile = volatile.filter((item) => item.id !== op.id);
          onState(overlay(remote));
          status();
        } catch (error) {
          const blocked = [
            "permission-denied",
            "unauthenticated",
            "resource-exhausted",
            "failed-precondition",
          ].includes(error.code);
          onStatus(
            !durable() ? "storage" : blocked ? "blocked" : "retry",
            error,
            entries().length,
          );
          if (!blocked) schedule();
          return;
        }
      }
    }
    function flush() {
      if (!running)
        running = Promise.resolve()
          .then(() => lock(run))
          .catch((error) => onStatus("recovery", error, entries().length))
          .finally(() => {
            running = null;
          });
      return running;
    }
    function enqueue(before, after) {
      if (closed) throw Error("Household session changed.");
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      const id =
        root.crypto?.randomUUID?.() ||
        Date.now().toString(36) +
          "-" +
          ++sequence +
          "-" +
          Math.random().toString(36).slice(2);
      const op = {
        id,
        createdAt: Date.now(),
        before: JSON.parse(JSON.stringify(before)),
        after: JSON.parse(JSON.stringify(after)),
      };
      try {
        storage.setItem(prefix + id, JSON.stringify(op));
      } catch (error) {
        volatile.push(op);
        onStatus("storage", error);
      }
      status();
      flush();
    }
    function close() {
      closed = true;
      clearTimeout(timer);
    }
    return {
      enqueue,
      flush,
      overlay,
      close,
      get pending() {
        return entries().length;
      },
      get durable() {
        return durable();
      },
      snapshot: () => entries().map(({ journalKey, ...op }) => op),
    };
  }
  root.HouseholdOutbox = { create };
})(globalThis);
