/* Uses the existing Firebase instance and membership. Never writes organiser data. */
export function installGifts({
  db,
  storage,
  auth,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  ref,
  uploadBytes,
  getBlob,
  deleteObject,
}) {
  const G = globalThis.HouseholdGifts;
  let session = null,
    stops = [],
    listeners = new Set(),
    generation = 0;
  let snapshot = {
    shared: G.empty(),
    private: G.empty(),
    ready: {},
    errors: {},
    uid: null,
  };
  const notify = () => listeners.forEach((fn) => fn(snapshot));
  const planner = (scope, s = session) =>
    scope === "shared" ? "shared" : s.uid;
  function requireSession() {
    if (
      !session ||
      auth.currentUser?.uid !== session.uid ||
      !auth.currentUser?.emailVerified
    )
      throw Error("Sign in to your verified household account.");
    if (navigator.onLine === false)
      throw Error(
        "Reconnect to save gift changes. Your form has been kept open.",
      );
    return session;
  }
  const target = (scope, s) =>
    doc(db, "households", s.hid, "giftPlanners", planner(scope, s));
  async function change(scope, command) {
    const s = requireSession();
    if (!["shared", "private"].includes(scope))
      throw Error("Choose a planner.");
    const result = await runTransaction(db, async (tx) => {
      const path = target(scope, s);
      if (session !== s || auth.currentUser?.uid !== s.uid)
        throw Error("Household session changed.");
      const old = await tx.get(path),
        data = old.exists() ? old.data().data : G.empty();
      const next = G.apply(data, command);
      tx.set(path, { data: next, updatedAt: serverTimestamp() });
      const removed = Object.values(data.gifts || {})
        .filter((g) => !next.gifts[g.id])
        .flatMap((g) =>
          Object.values(g.attachments || {}).map((a) => ({
            giftId: g.id,
            ...a,
          })),
        );
      return { data: next, removed };
    });
    // Realtime snapshots are authoritative. Replaying this transaction's result
    // could overwrite a newer snapshot received from the other phone.
    for (const a of result.removed) {
      try {
        await deleteObject(
          ref(
            storage,
            `households/${s.hid}/giftPlanners/${planner(scope, s)}/${a.giftId}/${a.objectId}`,
          ),
        );
      } catch {
        console.warn("A deleted gift attachment needs storage cleanup.");
      }
    }
    return result.data;
  }
  const api = {
    subscribe(fn) {
      listeners.add(fn);
      fn(snapshot);
      return () => listeners.delete(fn);
    },
    get snapshot() {
      return snapshot;
    },
    change,
    disconnect() {
      generation++;
      stops.forEach((stop) => stop());
      stops = [];
      session = null;
      snapshot = {
        shared: G.empty(),
        private: G.empty(),
        ready: {},
        errors: {},
        uid: null,
      };
      notify();
    },
    async refreshAnnual() {
      const s = session;
      if (!s || navigator.onLine === false) return;
      const d = new Date(),
        today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      for (const scope of ["shared", "private"]) {
        if (
          snapshot.ready[scope] &&
          G.ensureAnnual(snapshot[scope], today).changed
        ) {
          try {
            await change(scope, { kind: "annual", today });
          } catch (error) {
            if (session === s) {
              snapshot.errors[scope] = error.message;
              notify();
            }
          }
        }
      }
    },
    connect(hid, uid) {
      api.disconnect();
      session = { hid, uid };
      snapshot.uid = uid;
      const timer = setInterval(() => api.refreshAnnual(), 60000);
      stops.push(() => clearInterval(timer));
      const token = generation;
      for (const scope of ["shared", "private"]) {
        let rolling = false;
        stops.push(
          onSnapshot(
            target(scope, session),
            (snap) => {
              if (token !== generation) return;
              snapshot[scope] = snap.exists()
                ? { ...G.empty(), ...snap.data().data }
                : G.empty();
              snapshot.ready[scope] = true;
              delete snapshot.errors[scope];
              notify();
              const d = new Date();
              const normalized = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              if (
                !rolling &&
                G.ensureAnnual(snapshot[scope], normalized).changed &&
                navigator.onLine !== false
              ) {
                rolling = true;
                change(scope, { kind: "annual", today: normalized })
                  .catch((e) => {
                    if (token !== generation) return;
                    snapshot.errors[scope] = e.message;
                    notify();
                  })
                  .finally(() => (rolling = false));
              }
            },
            (error) => {
              if (token !== generation) return;
              snapshot[scope] = G.empty();
              snapshot.ready[scope] = false;
              snapshot.errors[scope] =
                "Gifts could not connect. Check the planner security rules and household access. " +
                error.message;
              notify();
            },
          ),
        );
      }
    },
    async upload(scope, giftId, file) {
      const s = requireSession();
      HouseholdEvents.validateFile(file);
      if (!snapshot[scope].gifts[giftId])
        throw Error("Save the gift before attaching files.");
      const objectId = crypto.randomUUID(),
        path = ref(
          storage,
          `households/${s.hid}/giftPlanners/${planner(scope, s)}/${giftId}/${objectId}`,
        );
      await uploadBytes(path, file, {
        contentType: file.type,
        contentDisposition: "attachment",
      });
      try {
        if (session !== s) throw Error("Household session changed.");
        await change(scope, {
          kind: "attachment",
          id: giftId,
          attachment: {
            objectId,
            name: file.name.slice(0, 250),
            type: file.type,
            size: file.size,
          },
        });
      } catch (error) {
        try {
          await deleteObject(path);
        } catch {}
        throw error;
      }
    },
    async download(scope, giftId, attachment) {
      const s = requireSession();
      if (!/^[a-f0-9-]{36}$/.test(attachment.objectId))
        throw Error("Invalid file reference.");
      const blob = await getBlob(
        ref(
          storage,
          `households/${s.hid}/giftPlanners/${planner(scope, s)}/${giftId}/${attachment.objectId}`,
        ),
        HouseholdEvents.maxBytes,
      );
      if (session !== s) throw Error("Session changed.");
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = attachment.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
    async removeAttachment(scope, giftId, attachment) {
      const s = requireSession();
      await deleteObject(
        ref(
          storage,
          `households/${s.hid}/giftPlanners/${planner(scope, s)}/${giftId}/${attachment.objectId}`,
        ),
      );
      if (session !== s) throw Error("Session changed.");
      return change(scope, {
        kind: "attachment",
        id: giftId,
        attachment,
        remove: true,
      });
    },
  };
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => api.refreshAnnual());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) api.refreshAnnual();
    });
  }
  return api;
}
