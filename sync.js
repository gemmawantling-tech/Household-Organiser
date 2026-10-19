/* Durable per-user/per-household task outbox. Operations are idempotent deltas. */
(function (root) {
  function create({
    storage,
    key,
    merge,
    write,
    onState = () => {},
    onStatus = () => {},
    online = () => true,
    retryMs = 15000,
  }) {
    let operations = [],
      running = null,
      closed = false,
      timer = null,
      durable = true;
    try {
      const raw = JSON.parse(storage.getItem(key) || "[]");
      if (
        !Array.isArray(raw) ||
        raw.some(
          (op) =>
            !op ||
            !op.before ||
            !op.after ||
            typeof op.before !== "object" ||
            typeof op.after !== "object",
        )
      )
        throw Error("Invalid pending data");
      operations = raw;
    } catch (error) {
      onStatus("recovery", error);
      throw Error(
        "Pending changes could not be read. Export a backup before clearing browser data.",
      );
    }
    function persist() {
      try {
        storage.setItem(key, JSON.stringify(operations));
        durable = true;
      } catch (error) {
        durable = false;
        onStatus("storage", error);
      }
    }
    function overlay(remote) {
      return operations.reduce(
        (data, op) => merge(data, op.before, op.after),
        remote,
      );
    }
    function status() {
      onStatus(
        !durable
          ? "storage"
          : operations.length
            ? online()
              ? "pending"
              : "offline"
            : online()
              ? "saved"
              : "offline",
        null,
        operations.length,
      );
    }
    function schedule() {
      if (!closed && !timer && operations.length) {
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
      while (operations.length && !closed) {
        const op = operations[0];
        try {
          const remote = await write(op);
          if (closed) return;
          operations.shift();
          persist();
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
            !durable ? "storage" : blocked ? "blocked" : "retry",
            error,
            operations.length,
          );
          if (!blocked) schedule();
          return;
        }
      }
    }
    function flush() {
      if (!running) {
        running = run().finally(() => {
          running = null;
        });
      }
      return running;
    }
    function enqueue(before, after) {
      if (closed) throw Error("Household session changed.");
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      operations.push({
        before: JSON.parse(JSON.stringify(before)),
        after: JSON.parse(JSON.stringify(after)),
      });
      persist();
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
        return operations.length;
      },
      get durable() {
        return durable;
      },
      snapshot: () => JSON.parse(JSON.stringify(operations)),
    };
  }
  root.HouseholdOutbox = { create };
})(globalThis);
