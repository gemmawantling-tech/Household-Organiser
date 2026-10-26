/* Gifts are deliberately separate from the legacy organiser document. */
(function (root) {
  const statuses = [
    "Not started",
    "Ideas saved",
    "Decided",
    "Ordered / booked",
    "Received",
    "Wrapped / prepared",
    "Ready to give",
    "Given",
  ];
  const types = ["Physical gift", "Experience", "Digital gift", "Subscription"];
  const empty = () => ({
    people: {},
    occasions: {},
    recipients: {},
    gifts: {},
  });
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const values = (x) => Object.values(x || {});
  function dateInYear(date, year) {
    const [month, day] = date.slice(5).split("-").map(Number);
    const last = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
  }
  function validDate(s) {
    if (!/^\d{4}-\d\d-\d\d$/.test(s || "")) return false;
    const d = new Date(s + "T12:00:00");
    return (
      !isNaN(d) &&
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` ===
        s
    );
  }
  function money(value) {
    if (value === "" || value == null) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 10000000)
      throw Error("Enter a positive amount or leave it blank.");
    return Math.round(n * 100);
  }
  function safeLink(value) {
    if (!value) return "";
    try {
      const u = new URL(value);
      if (["https:", "http:"].includes(u.protocol)) return u.href;
    } catch {}
    throw Error("Use a full https:// or http:// website link.");
  }
  function organised(g) {
    return (
      ["Ready to give", "Given"].includes(g.status) &&
      values(g.actions).every((a) => a.done)
    );
  }
  function progress(g) {
    const actions = values(g.actions);
    const done = actions.filter((a) => a.done).length;
    return {
      done,
      total: actions.length,
      percent: actions.length ? Math.round((done / actions.length) * 100) : 0,
      organised: organised(g),
    };
  }
  function summary(data, occasionId) {
    const gifts = values(data.gifts).filter((g) => g.occasionId === occasionId);
    const recipients = values(data.recipients).filter(
      (r) => r.occasionId === occasionId,
    );
    const actions = gifts.flatMap((g) => values(g.actions));
    const budget = data.occasions[occasionId]?.budget ?? null;
    const spent = gifts.reduce((s, g) => s + (g.cost || 0), 0);
    return {
      overallPercent:
        gifts.length + actions.length
          ? Math.round(
              ((gifts.filter(organised).length +
                actions.filter((a) => a.done).length) /
                (gifts.length + actions.length)) *
                100,
            )
          : 0,
      recipients: recipients.length,
      gifts: gifts.length,
      organised: gifts.filter(organised).length,
      outstanding: actions.filter((a) => !a.done).length,
      completed: actions.filter((a) => a.done).length,
      actions: actions.length,
      percent: actions.length
        ? Math.round(
            (actions.filter((a) => a.done).length / actions.length) * 100,
          )
        : 0,
      budget,
      spent,
      remaining: budget == null ? null : budget - spent,
    };
  }
  function outstanding(data, today) {
    return values(data.gifts)
      .flatMap((g) =>
        values(g.actions)
          .filter((a) => !a.done)
          .map((a) => ({
            ...a,
            giftId: g.id,
            occasionId: g.occasionId,
            title: g.title,
            recipientIds: g.recipientIds,
            urgency:
              a.due && a.due < today
                ? "Overdue"
                : a.reminder && a.reminder <= today
                  ? "Reminder"
                  : a.due &&
                      a.due <=
                        new Date(
                          new Date(today + "T12:00:00").getTime() +
                            7 * 86400000,
                        )
                          .toISOString()
                          .slice(0, 10)
                    ? "Next seven days"
                    : "Later",
          })),
      )
      .sort(
        (a, b) =>
          ["Overdue", "Reminder", "Next seven days", "Later"].indexOf(
            a.urgency,
          ) -
            ["Overdue", "Reminder", "Next seven days", "Later"].indexOf(
              b.urgency,
            ) || (a.due || "9999").localeCompare(b.due || "9999"),
      );
  }
  function ensureAnnual(source, today, seriesFilter = null) {
    const data = clone(source),
      year = Number(today.slice(0, 4));
    let changed = false;
    // Deterministic IDs make retries and simultaneous phone starts idempotent.
    for (const occasion of values(source.occasions).filter((o) => o.annual)) {
      const series = occasion.seriesId || occasion.id;
      if (seriesFilter && series !== seriesFilter) continue;
      const future = dateInYear(occasion.date, year) < today ? year + 1 : year;
      for (let y = Number(occasion.date.slice(0, 4)) + 1; y <= future; y++) {
        const key = series + "-" + y;
        if (
          data.occasions[key] ||
          values(data.occasions).some(
            (o) =>
              (o.seriesId || o.id) === series &&
              o.date === dateInYear(occasion.date, y),
          )
        )
          continue;
        data.occasions[key] = {
          ...occasion,
          id: key,
          seriesId: series,
          date: dateInYear(occasion.date, y),
          budget: null,
        };
        for (const r of values(source.recipients).filter(
          (r) => r.occasionId === occasion.id,
        )) {
          const rid = key + "-" + (r.personId || r.id);
          if (!data.recipients[rid])
            data.recipients[rid] = {
              ...r,
              id: rid,
              occasionId: key,
              budget: null,
            };
        }
        changed = true;
      }
    }
    return { data, changed };
  }
  function validate(data) {
    for (const o of values(data.occasions)) {
      if (!o.name?.trim() || !validDate(o.date))
        throw Error("Give the occasion a name and valid date.");
    }
    for (const r of values(data.recipients)) {
      if (!r.name?.trim() || !data.occasions[r.occasionId])
        throw Error("Choose an occasion and recipient name.");
    }
    for (const g of values(data.gifts)) {
      if (
        !g.title?.trim() ||
        !data.occasions[g.occasionId] ||
        !statuses.includes(g.status) ||
        !types.includes(g.type)
      )
        throw Error("Complete the gift title, type and status.");
      if (
        !g.recipientIds?.length ||
        g.recipientIds.some(
          (id) => data.recipients[id]?.occasionId !== g.occasionId,
        )
      )
        throw Error("Choose at least one recipient for this occasion.");
      safeLink(g.link);
      for (const link of g.links || []) safeLink(link);
      for (const a of values(g.actions)) {
        if (
          !a.text?.trim() ||
          (a.due && !validDate(a.due)) ||
          (a.reminder && !validDate(a.reminder))
        )
          throw Error("Each action needs a name and valid optional dates.");
      }
    }
    return data;
  }
  function apply(source, command) {
    const data = { ...empty(), ...clone(source) };
    const { kind, id, patch = {} } = command;
    if (kind === "batch")
      return command.commands.reduce((d, c) => apply(d, c), data);
    if (kind === "annual")
      return ensureAnnual(data, command.today, command.seriesId).data;
    if (kind === "put") {
      const collection = command.collection;
      if (!["occasions", "recipients", "gifts", "people"].includes(collection))
        throw Error("Unknown gift record.");
      if (command.mustExist && !data[collection][id])
        throw Error("This record was deleted on another device.");
      // Merge only fields changed in the editor over the latest transaction snapshot.
      const current = data[collection][id] || {};
      data[collection][id] = root.HouseholdEvents.mergeChanges(
        current,
        command.before || {},
        { ...(command.before || {}), ...patch, id },
      );
    } else if (kind === "action") {
      const g = data.gifts[id];
      if (!g?.actions?.[command.actionId])
        throw Error("This action was removed on another device.");
      g.actions[command.actionId].done = !!command.done;
    } else if (kind === "delete") {
      if (command.collection === "occasions")
        throw Error("Archive occasions by keeping their history.");
      if (command.collection === "recipients") {
        for (const g of values(data.gifts).filter((g) =>
          g.recipientIds.includes(id),
        )) {
          g.recipientIds = g.recipientIds.filter((r) => r !== id);
          if (!g.recipientIds.length) delete data.gifts[g.id];
        }
      }
      delete data[command.collection][id];
    } else if (kind === "duplicate") {
      const old = data.gifts[id];
      if (!old) throw Error("Gift unavailable.");
      data.gifts[command.newId] = {
        ...clone(old),
        id: command.newId,
        title: old.title + " (copy)",
        status: "Not started",
        cost: null,
        attachments: {},
        actions: Object.fromEntries(
          values(old.actions).map((a) => [
            a.id,
            { ...a, done: false, due: "", reminder: "" },
          ]),
        ),
      };
    } else if (kind === "move") {
      const g = data.gifts[id];
      if (!g || !data.occasions[command.occasionId])
        throw Error("Gift or occasion unavailable.");
      g.recipientIds = g.recipientIds.map((rid) => {
        const r = data.recipients[rid];
        const existing = values(data.recipients).find(
          (x) =>
            x.occasionId === command.occasionId &&
            (r.personId ? x.personId === r.personId : x.name === r.name),
        );
        if (existing) return existing.id;
        const next = command.occasionId + "-" + (r.personId || r.id);
        data.recipients[next] = {
          ...r,
          id: next,
          occasionId: command.occasionId,
          budget: null,
        };
        return next;
      });
      g.occasionId = command.occasionId;
    } else if (kind === "attachment") {
      if (!data.gifts[id]) throw Error("Gift deleted.");
      data.gifts[id].attachments = { ...data.gifts[id].attachments };
      if (command.remove)
        delete data.gifts[id].attachments[command.attachment.objectId];
      else
        data.gifts[id].attachments[command.attachment.objectId] =
          command.attachment;
    } else throw Error("Unknown planner change.");
    return validate(data);
  }
  root.HouseholdGifts = {
    statuses,
    types,
    empty,
    values,
    clone,
    dateInYear,
    validDate,
    money,
    safeLink,
    organised,
    progress,
    summary,
    outstanding,
    ensureAnnual,
    apply,
  };
})(globalThis);
