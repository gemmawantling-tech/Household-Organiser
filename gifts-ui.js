/* Small focused editors; no planner data enters the household shopping/task document. */
(function () {
  const G = HouseholdGifts,
    V = G.values,
    node = (tag, cls, text) => el(tag, cls, text),
    uid = () => crypto.randomUUID();
  const root = $("panelGifts");
  const openFiles = new Set();
  const actionPanels = new Map();
  let scope = "shared",
    selectedId = null,
    filter = "outstanding",
    expanded = null,
    service = null,
    snapshot = { shared: G.empty(), private: G.empty(), ready: {}, errors: {} },
    busy = false;
  const message = node("p", "gift-message");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  root.before(message);
  message.hidden = true;
  const modal = document.createElement("dialog");
  modal.id = "giftDialog";
  modal.setAttribute("aria-labelledby", "giftEditorTitle");
  document.body.append(modal);
  function say(text) {
    message.textContent = text;
    message.hidden = !text;
  }
  const money = (n) =>
    n == null
      ? "—"
      : new Intl.NumberFormat("en-GB", {
          style: "currency",
          currency: "GBP",
        }).format(n / 100);
  const today = () => iso(new Date());
  const dateLabel = (d) =>
    parseISO(d)?.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) || d;
  function button(text, fn, cls = "") {
    const b = node("button", cls, text);
    b.type = "button";
    b.onclick = fn;
    return b;
  }
  function field(form, label, type = "text", value = "", required = false) {
    const wrap = node("label", "gift-field", label),
      input = document.createElement(
        type === "textarea" ? "textarea" : "input",
      );
    if (type !== "textarea") input.type = type;
    input.value = value ?? "";
    input.required = required;
    if (type === "textarea") {
      input.rows = 3;
      input.maxLength = 10000;
    } else if (type === "text") {
      input.maxLength = 500;
    }
    if (type === "number") {
      input.min = 0;
      input.step = "0.01";
      input.max = 10000000;
    }
    wrap.append(input);
    form.append(wrap);
    return input;
  }
  function select(form, label, options, value) {
    const wrap = node("div", "gift-field"),
      caption = node("label", "", label),
      input = node("select");
    input.id = "gift-select-" + uid();
    caption.htmlFor = input.id;
    wrap.append(caption);
    for (const [id, text] of options) {
      const option = node("option", "", text);
      option.value = id;
      input.append(option);
    }
    input.value = value;
    wrap.append(input);
    form.append(wrap);
    return input;
  }
  function editor(title, submit) {
    modal.replaceChildren();
    const form = node("form", "gift-form"),
      heading = node("h2", "", title);
    heading.id = "giftEditorTitle";
    form.append(heading);
    const status = node("p", "gift-form-message");
    status.setAttribute("role", "alert");
    const footer = node("div", "gift-editor-footer"),
      save = button("Save", () => {}, "primary");
    save.type = "submit";
    footer.append(
      save,
      button("Cancel", () => modal.close()),
    );
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      save.disabled = true;
      status.textContent = "Saving…";
      try {
        await submit();
        render();
        modal.close();
        say("Gifts saved.");
      } catch (error) {
        status.textContent = error.message;
      } finally {
        busy = false;
        save.disabled = false;
      }
    };
    modal.append(form);
    return {
      form,
      finish() {
        form.append(status, footer);
        modal.showModal();
      },
      status,
    };
  }
  function fold(form, title) {
    const details = node("details", "gift-form-section");
    details.append(node("summary", "", title));
    form.append(details);
    return details;
  }
  async function change(command, which = scope) {
    if (!service) throw Error("Connect to your household first.");
    return service.change(which, command);
  }
  async function run(fn) {
    try {
      await fn();
      say("Gifts saved.");
    } catch (error) {
      say(error.message);
    }
  }
  const data = () => snapshot[scope];
  function switchScope(next) {
    scope = next;
    selectedId = null;
    expanded = null;
    render();
  }
  function occasionEditor() {
    const initialScope = scope;
    let ui;
    ui = editor("Plan an occasion", async () => {
      const key = uid();
      const date = when.value;
      await change(
        {
          kind: "put",
          collection: "occasions",
          id: key,
          patch: {
            name: name.value.trim(),
            date,
            type: type.value,
            annual: annual.checked,
            budget: G.money(budget.value),
            seriesId: key,
          },
        },
        initialScope,
      );
      selectedId = key;
    });
    const name = field(ui.form, "Occasion name", "text", "", true),
      type = select(
        ui.form,
        "Occasion",
        [
          ["Christmas", "Christmas"],
          ["Birthday", "Birthday"],
          ["Anniversary", "Anniversary"],
          ["Other", "Other"],
        ],
        "Christmas",
      );
    const year = new Date().getFullYear(),
      christmas =
        `${year}-12-25` >= today() ? `${year}-12-25` : `${year + 1}-12-25`;
    name.value = "Christmas";
    type.onchange = () =>
      (name.value =
        type.value === "Christmas"
          ? "Christmas"
          : type.value === "Birthday"
            ? "Birthday"
            : type.value === "Anniversary"
              ? "Anniversary"
              : "");
    const when = field(ui.form, "Date", "date", christmas, true),
      annual = field(ui.form, "Repeat each year", "checkbox");
    annual.checked = true;
    const budget = field(ui.form, "Total budget (£, optional)", "number");
    ui.form.append(
      node(
        "p",
        "notice",
        initialScope === "private"
          ? "Only you can see this occasion, its gifts and files."
          : "Shared with your household. Choose Only me on the dashboard before planning a surprise.",
      ),
    );
    ui.finish();
  }
  function recipientEditor(record = null) {
    const plan = G.clone(data()),
      occasionId = record?.occasionId || selectedId,
      which = scope;
    let ui;
    ui = editor(record ? "Edit recipient" : "Add recipient", async () => {
      const id = record?.id || uid(),
        nameValue = name.value.trim();
      let personId =
        record?.personId ||
        V(plan.people).find(
          (p) => p.name.toLowerCase() === nameValue.toLowerCase(),
        )?.id ||
        uid();
      const commands = [
        {
          kind: "put",
          collection: "people",
          id: personId,
          before: plan.people[personId] || {},
          patch: { name: nameValue, birthday: birthday.value },
        },
        {
          kind: "put",
          collection: "recipients",
          id,
          before: record || {},
          mustExist: !!record,
          patch: {
            name: nameValue,
            occasionId,
            personId,
            budget: G.money(budget.value),
            notes: notes.value,
          },
        },
      ];
      if (birthday.value) {
        const thisYear = G.dateInYear(birthday.value, new Date().getFullYear()),
          next =
            thisYear < today()
              ? G.dateInYear(birthday.value, new Date().getFullYear() + 1)
              : thisYear;
        const series = "birthday-" + personId,
          key = series + "-" + next.slice(0, 4);
        if (!plan.occasions[key])
          commands.push(
            {
              kind: "put",
              collection: "occasions",
              id: key,
              patch: {
                name: nameValue + "’s birthday",
                date: next,
                type: "Birthday",
                annual: true,
                seriesId: series,
                budget: null,
              },
            },
            {
              kind: "put",
              collection: "recipients",
              id: key + "-" + personId,
              patch: {
                name: nameValue,
                personId,
                occasionId: key,
                budget: null,
                notes: "",
              },
            },
          );
        else if (plan.occasions[key].date >= today())
          commands.push({
            kind: "put",
            collection: "occasions",
            id: key,
            before: plan.occasions[key],
            mustExist: true,
            patch: { name: nameValue + "’s birthday", date: next },
          });
      }
      await change({ kind: "batch", commands }, which);
      expanded = id;
    });
    const name = field(
        ui.form,
        "Name or group",
        "text",
        record?.name || "",
        true,
      ),
      budget = field(
        ui.form,
        "Recipient budget (£, optional)",
        "number",
        record?.budget == null ? "" : record.budget / 100,
      );
    const more = fold(ui.form, "Birthday & notes"),
      birthday = field(
        more,
        "Birthday (optional)",
        "date",
        plan.people[record?.personId]?.birthday || "",
      ),
      notes = field(more, "Notes", "textarea", record?.notes || "");
    more.append(
      node(
        "p",
        "notice",
        "A birthday creates the next annual birthday occasion. Earlier gift records are kept.",
      ),
    );
    ui.finish();
  }
  function giftEditor(recipientId, record = null, shopping = null) {
    const plan = G.clone(data()),
      which = scope,
      occasionId = record?.occasionId || selectedId;
    let ui;
    const actionRows = [];
    ui = editor(record ? "Edit gift" : "Add gift", async () => {
      const recipientIds = [
          ...recipients.querySelectorAll("input:checked"),
        ].map((n) => n.value),
        actions = {};
      for (const row of actionRows) {
        if (!row.deleted) {
          if (!row.text.value.trim()) continue;
          actions[row.id] = {
            id: row.id,
            text: row.text.value.trim(),
            done: row.done.checked,
            due: row.due.value,
            reminder: row.reminder.value,
          };
        }
      }
      const id = record?.id || uid();
      await change(
        {
          kind: "put",
          collection: "gifts",
          id,
          before: record || {},
          mustExist: !!record,
          patch: {
            title: title.value.trim(),
            occasionId,
            recipientIds,
            type: type.value,
            status: status.value,
            description: description.value,
            ideas: ideas.value,
            budget: G.money(budget.value),
            cost: G.money(cost.value),
            link: "",
            links: link.value
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean)
              .map(G.safeLink),
            notes: notes.value,
            actions,
            attachments: record?.attachments || {},
            ...(shopping
              ? { shoppingSource: shopping.scope + "|" + shopping.item.id }
              : {}),
          },
        },
        which,
      );
      if (shopping && transfer.value === "move") {
        const current = (state.shopping[shopping.scope] || []).find(
          (i) => i.id === shopping.item.id,
        );
        if (current) {
          state.shopping[shopping.scope] = state.shopping[
            shopping.scope
          ].filter((i) => i.id !== current.id);
          save();
        }
      }
      expanded = recipientIds[0];
    });
    const title = field(
      ui.form,
      "Gift or idea",
      "text",
      record?.title || shopping?.item.text || "",
      true,
    );
    const recipients = node("fieldset", "gift-recipient-picker");
    recipients.append(
      node("legend", "", "For whom? Select everyone sharing this gift."),
    );
    for (const r of V(plan.recipients).filter(
      (r) => r.occasionId === occasionId,
    )) {
      const label = node("label", "gift-check", r.name),
        check = node("input");
      check.type = "checkbox";
      check.value = r.id;
      check.checked = record
        ? record.recipientIds.includes(r.id)
        : r.id === recipientId;
      label.prepend(check);
      recipients.append(label);
    }
    ui.form.append(recipients);
    const type = select(
        ui.form,
        "Gift type",
        G.types.map((x) => [x, x]),
        record?.type || "Physical gift",
      ),
      status = select(
        ui.form,
        "Status",
        G.statuses.map((x) => [x, x]),
        record?.status || "Not started",
      );
    type.onchange = () => {
      status
        .querySelectorAll("option")
        .forEach(
          (o) =>
            (o.hidden =
              type.value !== "Physical gift" &&
              ["Received", "Wrapped / prepared"].includes(o.value) &&
              o.value !== status.value),
        );
    };
    type.onchange();
    const actionsBox = node("section", "gift-actions-editor");
    actionsBox.append(
      node("h3", "", "Preparation checklist"),
      node(
        "p",
        "notice",
        "Booked is a gift status. Tick preparation actions separately.",
      ),
    );
    ui.form.append(actionsBox);
    function actionEditor(
      a = { id: uid(), text: "", done: false, due: "", reminder: "" },
    ) {
      const wrap = node("div", "gift-action-editor"),
        row = { id: a.id, wrap };
      row.text = field(wrap, "Action", "text", a.text);
      row.done = field(wrap, "Completed", "checkbox");
      row.done.checked = a.done;
      const dates = fold(wrap, "Due date & reminder");
      row.due = field(dates, "Due date (optional)", "date", a.due);
      row.reminder = field(
        dates,
        "Show reminder from (optional)",
        "date",
        a.reminder,
      );
      wrap.append(
        button(
          "Remove action",
          () => {
            row.deleted = true;
            wrap.remove();
          },
          "gift-quiet",
        ),
      );
      actionRows.push(row);
      actionsBox.append(wrap);
    }
    V(record?.actions).forEach(actionEditor);
    actionsBox.append(button("+ Add action", () => actionEditor()));
    const info = fold(ui.form, "Gift details & ideas"),
      description = field(
        info,
        "Purchased or booked details",
        "textarea",
        record?.description || "",
      ),
      ideas = field(
        info,
        "Ideas (one per line)",
        "textarea",
        record?.ideas || "",
      );
    const amounts = fold(ui.form, "Budget & cost"),
      budget = field(
        amounts,
        "Gift budget (£, optional)",
        "number",
        record?.budget == null ? "" : record.budget / 100,
      ),
      cost = field(
        amounts,
        "Actual total cost (£, optional)",
        "number",
        record?.cost == null ? "" : record.cost / 100,
      );
    amounts.append(
      node(
        "p",
        "notice",
        "Joint gifts are stored once: enter the whole cost, not a cost per recipient.",
      ),
    );
    const extras = fold(ui.form, "Website & notes"),
      link = field(
        extras,
        "Website or booking links (one per line)",
        "textarea",
        record?.links?.join("\n") || record?.link || "",
      ),
      notes = field(extras, "Notes", "textarea", record?.notes || "");
    let transfer;
    if (shopping) {
      transfer = select(
        ui.form,
        "Shopping item",
        [
          ["link", "Keep shopping item and link gift"],
          ["move", "Move item out of everyday shopping"],
        ],
        "link",
      );
      ui.form.append(
        node(
          "p",
          "notice",
          "Shopping changes happen only after the gift is saved.",
        ),
      );
    } else
      ui.form.append(
        node(
          "p",
          "notice",
          "Save the gift, then add PDFs, photos and vouchers from its card.",
        ),
      );
    ui.finish();
  }
  function shoppingEditor() {
    if (
      !selectedId ||
      !V(data().recipients).some((r) => r.occasionId === selectedId)
    ) {
      say("Add an occasion and recipient first.");
      return;
    }
    const items = Object.entries(state.shopping).flatMap(([scope, rows]) =>
      rows.map((item) => ({ scope, item })),
    );
    if (!items.length) {
      say("Your everyday shopping lists are empty.");
      return;
    }
    const ui = editor("From shopping to Gifts", async () => {});
    ui.form.onsubmit = (event) => event.preventDefault();
    const itemSelect = select(
      ui.form,
      "Shopping item",
      items.map((x, i) => [String(i), x.item.text + " · " + x.scope]),
      "0",
    );
    ui.form.append(
      button(
        "Continue",
        () => {
          modal.close();
          giftEditor(
            V(data().recipients).find((r) => r.occasionId === selectedId).id,
            null,
            items[Number(itemSelect.value)],
          );
        },
        "primary",
      ),
    );
    ui.form.append(button("Cancel", () => modal.close()));
    modal.showModal();
  }
  async function toggleAction(g, a, check, focusId) {
    const which = scope,
      old = snapshot[which],
      optimistic = G.apply(old, {
        kind: "action",
        id: g.id,
        actionId: a.id,
        done: check,
      });
    snapshot = { ...snapshot, [which]: optimistic };
    render();
    document.getElementById(focusId)?.focus({ preventScroll: true });
    try {
      await change(
        { kind: "action", id: g.id, actionId: a.id, done: check },
        which,
      );
    } catch (error) {
      snapshot = { ...snapshot, [which]: old };
      render();
      say(error.message);
    }
  }
  function actionCheck(g, a, context = false, instance = "") {
    const label = node("label", "gift-check" + (a.done ? " done" : "")),
      check = node("input");
    check.type = "checkbox";
    check.checked = a.done;
    check.id =
      "gift-action-" +
      g.id +
      "-" +
      a.id +
      (context ? "-dashboard" : "-" + instance);
    check.setAttribute(
      "aria-label",
      (a.done ? "Reopen " : "Complete ") + a.text,
    );
    check.onchange = () => toggleAction(g, a, check.checked, check.id);
    label.append(check, node("span", "", a.text));
    if (a.due) label.append(node("small", "muted", dateLabel(a.due)));
    if (context)
      label.append(
        node(
          "small",
          "muted",
          g.recipientIds.map((id) => data().recipients[id]?.name).join(" & ") +
            " · " +
            g.title +
            " · " +
            data().occasions[g.occasionId]?.name +
            " " +
            data().occasions[g.occasionId]?.date.slice(0, 4),
        ),
      );
    return label;
  }
  function moveGift(g) {
    const which = scope;
    const ui = editor("Move gift to an occasion", async () =>
      change({ kind: "move", id: g.id, occasionId: destination.value }, which),
    );
    const destination = select(
      ui.form,
      "Destination",
      V(data().occasions)
        .filter((o) => o.id !== g.occasionId)
        .map((o) => [o.id, o.name + " · " + dateLabel(o.date)]),
      "",
    );
    if (!destination.options.length) {
      say("Create another occasion in this planner first.");
      return;
    }
    destination.selectedIndex = 0;
    ui.finish();
  }
  function history(recipient) {
    const box = node("details", "gift-history");
    box.append(node("summary", "", "Previous gifts"));
    const ids = V(data().recipients)
      .filter(
        (r) =>
          r.occasionId !== recipient.occasionId &&
          data().occasions[r.occasionId]?.date <
            data().occasions[recipient.occasionId]?.date &&
          (recipient.personId
            ? r.personId === recipient.personId
            : r.name === recipient.name),
      )
      .map((r) => r.id);
    const gifts = V(data().gifts).filter((g) =>
      g.recipientIds.some((id) => ids.includes(id)),
    );
    for (const g of gifts)
      box.append(
        node(
          "p",
          "",
          g.title +
            " · " +
            (data().occasions[g.occasionId]?.name || "") +
            " " +
            data().occasions[g.occasionId]?.date.slice(0, 4) +
            " · " +
            g.status,
        ),
      );
    if (!gifts.length)
      box.append(
        node(
          "p",
          "notice",
          "Previous gifts will be kept here for future years.",
        ),
      );
    return box;
  }
  function giftCard(g, recipientId) {
    const article = node("article", "gift-item");
    const head = node("div", "row");
    head.append(node("h4", "", g.title), node("span", "tag", g.status));
    article.append(head);
    if (g.recipientIds.length > 1)
      article.append(
        node(
          "p",
          "notice",
          "Joint gift · " +
            g.recipientIds
              .map((id) => data().recipients[id]?.name)
              .join(" & ") +
            " · cost counted once",
        ),
      );
    const p = G.progress(g);
    article.append(
      node(
        "p",
        "notice",
        p.done +
          "/" +
          p.total +
          " preparation actions complete" +
          (p.organised ? " · Organised" : ""),
      ),
    );
    if (g.description) article.append(node("p", "", g.description));
    if (g.ideas)
      article.append(node("p", "gift-preserve", "Ideas: " + g.ideas));
    if (g.budget != null || g.cost != null)
      article.append(
        node(
          "p",
          "notice",
          "Budget " + money(g.budget) + " · Cost " + money(g.cost),
        ),
      );
    for (const url of g.links || [g.link].filter(Boolean)) {
      try {
        const link = node("a", "gift-link", "Website / booking ↗");
        link.href = G.safeLink(url);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        article.append(link);
      } catch {}
    }
    if (g.notes) article.append(node("p", "gift-preserve", g.notes));
    for (const a of V(g.actions))
      article.append(actionCheck(g, a, false, recipientId));
    const attachments = node("details", "gift-files");
    attachments.open = openFiles.has(g.id);
    attachments.ontoggle = () => {
      if (!attachments.isConnected) return;
      if (attachments.open) openFiles.add(g.id);
      else openFiles.delete(g.id);
    };
    attachments.append(
      node(
        "summary",
        "",
        "Files & vouchers" +
          (V(g.attachments).length ? " · " + V(g.attachments).length : ""),
      ),
    );
    for (const file of V(g.attachments)) {
      const row = node("div", "row");
      row.append(
        button(file.name, () => run(() => service.download(scope, g.id, file))),
        button(
          "Remove file",
          () => {
            if (confirm("Delete this attachment?"))
              run(() => service.removeAttachment(scope, g.id, file));
          },
          "gift-quiet",
        ),
      );
      attachments.append(row);
    }
    const label = node("label", "gift-field", "Add PDF or photo (up to 10 MB)"),
      file = node("input");
    file.type = "file";
    file.accept = "application/pdf,image/png,image/jpeg,image/webp";
    label.append(file);
    attachments.append(
      label,
      button("Upload file", () => {
        if (!file.files[0]) {
          say("Choose a file first.");
          return;
        }
        const chosen = file.files[0],
          which = scope;
        run(() => service.upload(which, g.id, chosen));
      }),
    );
    article.append(attachments);
    const controls = node("div", "gift-controls");
    controls.append(
      button("Edit", () => giftEditor(g.recipientIds[0], g)),
      button("Duplicate", () =>
        run(() => change({ kind: "duplicate", id: g.id, newId: uid() })),
      ),
      button("Move", () => moveGift(g)),
      button(
        "Delete gift",
        () => {
          if (confirm("Delete this gift and its checklist?"))
            run(() =>
              change({ kind: "delete", collection: "gifts", id: g.id }),
            );
        },
        "gift-quiet",
      ),
    );
    article.append(controls);
    return article;
  }
  function calendarLink(occasion) {
    if (scope === "private")
      return node(
        "p",
        "notice",
        "Private occasions stay out of the shared calendar.",
      );
    return button("View / add to household calendar", () =>
      run(async () => {
        const existing = state.events.find(
          (e) =>
            e.id === occasion.calendarEventId ||
            e.id === "gift-occasion-" + (occasion.seriesId || occasion.id) ||
            (e.title.toLowerCase() === occasion.name.toLowerCase() &&
              (e.date === occasion.date ||
                (e.repeat === "yearly" &&
                  e.date.slice(5) === occasion.date.slice(5)))),
        );
        if (existing) {
          openEvent(existing.id);
          return;
        }
        const eventId = "gift-occasion-" + (occasion.seriesId || occasion.id);
        await householdSync.saveEvent(eventId, {
          title: occasion.name,
          date: occasion.date,
          time: "",
          repeat: occasion.annual ? "yearly" : "none",
          assignee: "Shared",
        });
        await change({
          kind: "put",
          collection: "occasions",
          id: occasion.id,
          before: occasion,
          mustExist: true,
          patch: { calendarEventId: eventId },
        });
      }),
    );
  }
  function render() {
    root.replaceChildren();
    const header = node("div", "gift-heading");
    header.append(
      node("p", "eyebrow", "THOUGHTFUL GIVING"),
      node("h2", "view-title", "Gifts & occasions"),
      node("p", "muted", "A little planning. Something lovely to give."),
    );
    root.append(header);
    const scopes = node("div", "segmented");
    scopes.setAttribute("aria-label", "Planner privacy");
    for (const [key, label] of [
      ["shared", "Household"],
      ["private", "Only me 🔒"],
    ]) {
      const b = button(
        label,
        () => switchScope(key),
        scope === key ? "active" : "",
      );
      b.setAttribute("aria-pressed", String(scope === key));
      scopes.append(b);
    }
    root.append(
      scopes,
      node(
        "p",
        "notice",
        scope === "private"
          ? "Only you can see this planner, its totals, reminders and attachments."
          : "Shared with authorised household members. Use Only me for surprises.",
      ),
    );
    if (snapshot.errors[scope])
      root.append(node("p", "gift-error", snapshot.errors[scope]));
    if (!snapshot.ready[scope]) {
      root.append(
        node(
          "p",
          "notice",
          snapshot.errors[scope]
            ? "Existing household tasks and lists are unaffected."
            : "Connecting your planner…",
        ),
      );
      return;
    }
    const occasions = V(data().occasions).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      future = occasions.filter((o) => o.date >= today());
    if (!data().occasions[selectedId])
      selectedId =
        future.find((o) => o.type === "Christmas")?.id ||
        future[0]?.id ||
        occasions.at(-1)?.id;
    if (occasions.length) {
      const choose = select(
        root,
        "Occasion & year",
        occasions.map((o) => [o.id, o.name + " · " + dateLabel(o.date)]),
        selectedId,
      );
      choose.onchange = () => {
        selectedId = choose.value;
        expanded = null;
        render();
      };
    }
    const topActions = node("div", "gift-controls");
    topActions.append(
      button("+ Occasion", occasionEditor),
      button("From shopping", shoppingEditor),
    );
    root.append(topActions);
    if (!selectedId) {
      const empty = node("section", "gift-hero");
      empty.append(
        node("div", "gift-hero-icon", "🎁"),
        node("h3", "", "Make room for something thoughtful"),
        node(
          "p",
          "",
          "Start Christmas, a birthday or another special day. Keep ideas, gifts and the little finishing jobs together.",
        ),
        button("Start an occasion", occasionEditor, "primary"),
      );
      root.append(empty);
      return;
    }
    const occasion = data().occasions[selectedId],
      s = G.summary(data(), selectedId),
      hero = node("section", "gift-hero");
    hero.append(
      node(
        "p",
        "eyebrow",
        occasion.type === "Christmas"
          ? "THE CHRISTMAS PLANNER"
          : occasion.type.toUpperCase(),
      ),
      node("h3", "", occasion.name + " " + occasion.date.slice(0, 4)),
      node(
        "p",
        "muted",
        dateLabel(occasion.date) +
          (occasion.annual ? " · Repeats annually" : ""),
      ),
    );
    const stats = node("div", "gift-stats");
    for (const [n, label] of [
      [s.recipients, "recipients"],
      [s.organised + "/" + s.gifts, "gifts organised"],
      [s.outstanding, "actions left"],
    ]) {
      const cell = node("div");
      cell.append(node("strong", "", n), node("span", "", label));
      stats.append(cell);
    }
    hero.append(stats);
    const progress = node("progress");
    progress.max = 100;
    progress.value = s.overallPercent;
    progress.setAttribute("aria-label", "Gift and preparation progress");
    hero.append(
      progress,
      node(
        "p",
        "notice",
        s.completed +
          "/" +
          s.actions +
          " actions complete · " +
          s.overallPercent +
          "% overall",
      ),
    );
    if (s.budget != null || s.spent)
      hero.append(
        node(
          "p",
          "gift-budget",
          "Budget " +
            money(s.budget) +
            " · Spent " +
            money(s.spent) +
            (s.remaining == null
              ? ""
              : " · " + money(s.remaining) + " remaining"),
        ),
      );
    hero.append(
      button("Edit occasion", () => editOccasion(occasion)),
      calendarLink(occasion),
    );
    if (occasion.annual)
      hero.append(
        button("Plan next year", () =>
          run(async () => {
            const year = Number(occasion.date.slice(0, 4)) + 1;
            await change({
              kind: "annual",
              today: G.dateInYear(occasion.date, year),
              seriesId: occasion.seriesId || occasion.id,
            });
            selectedId = (occasion.seriesId || occasion.id) + "-" + year;
            expanded = null;
            render();
          }),
        ),
      );
    root.append(hero);
    const tasks = node("details", "gift-outstanding");
    const panelKey = scope + ":" + selectedId;
    tasks.open = actionPanels.get(panelKey) ?? true;
    tasks.ontoggle = () => {
      if (tasks.isConnected) actionPanels.set(panelKey, tasks.open);
    };
    const actions = G.outstanding(data(), today());
    tasks.append(node("summary", "", "The little things left to do · " + actions.length));
    let group = "";
    for (const a of actions) {
      if (a.urgency !== group) {
        group = a.urgency;
        tasks.append(
          node("h4", group === "Overdue" ? "gift-overdue" : "", group),
        );
      }
      const g = data().gifts[a.giftId],
        row = node("div", "gift-dashboard-action");
      row.append(
        actionCheck(g, a, true),
        button(
          "Open gift",
          () => {
            selectedId = a.occasionId;
            expanded = g.recipientIds[0];
            filter = "all";
            render();
            $("recipient-" + expanded)?.scrollIntoView({ block: "center" });
          },
          "gift-quiet",
        ),
      );
      tasks.append(row);
    }
    if (!actions.length)
      tasks.append(
        node(
          "p",
          "notice",
          "No outstanding preparation actions. Add your own checklist to any gift.",
        ),
      );
    tasks.append(
      node(
        "p",
        "notice",
        "Reminders appear here when due. No push notifications are sent.",
      ),
    );
    root.append(tasks);
    const recipientsHeading = node("div", "row");
    recipientsHeading.append(
      node("h3", "", "Your recipients"),
      button("+ Add recipient", () => recipientEditor()),
    );
    root.append(recipientsHeading);
    const filters = node("div", "segmented");
    for (const key of ["outstanding", "organised", "all"]) {
      const b = button(
        key[0].toUpperCase() + key.slice(1),
        () => {
          filter = key;
          render();
        },
        key === filter ? "active" : "",
      );
      b.setAttribute("aria-pressed", String(key === filter));
      filters.append(b);
    }
    root.append(filters);
    const recipients = V(data().recipients).filter(
      (r) => r.occasionId === selectedId,
    );
    let displayed = 0;
    for (const r of recipients) {
      const allGifts = V(data().gifts).filter((g) =>
          g.recipientIds.includes(r.id),
        ),
        gifts = allGifts.filter(
          (g) =>
            filter === "all" ||
            (filter === "organised" ? G.organised(g) : !G.organised(g)),
        );
      if (
        (filter === "organised" && !gifts.length) ||
        (filter === "outstanding" && allGifts.length && !gifts.length)
      )
        continue;
      displayed++;
      const card = node("details", "gift-recipient");
      card.name = "gift-recipients";
      card.id = "recipient-" + r.id;
      card.open = expanded === r.id;
      const summary = node("summary"),
        title = node("span", "gift-recipient-name", r.name),
        preview = node(
          "span",
          "gift-recipient-preview",
          allGifts.map((g) => g.title).join(" · ") || "No gifts yet",
        ),
        count = node(
          "span",
          "tag",
          allGifts.filter(G.organised).length +
            "/" +
            allGifts.length +
            " organised",
        );
      summary.append(title, preview, count);
      card.append(summary);
      card.ontoggle = () => {
        if (!card.isConnected) return;
        if (card.open) {
          expanded = r.id;
          for (const other of root.querySelectorAll(".gift-recipient"))
            if (other !== card) other.open = false;
        } else if (expanded === r.id) expanded = null;
      };
      if (r.budget != null)
        card.append(
          node(
            "p",
            "notice",
            "Recipient budget " +
              money(r.budget) +
              " · Joint gift costs appear once in the occasion total.",
          ),
        );
      if (r.notes) card.append(node("p", "gift-preserve", r.notes));
      for (const g of gifts) card.append(giftCard(g, r.id));
      card.append(
        button("+ Add gift", () => giftEditor(r.id), "primary"),
        button("Edit recipient", () => recipientEditor(r)),
        button(
          "Delete recipient",
          () => {
            if (
              confirm(
                "Delete " +
                  r.name +
                  "? Gifts only for this recipient will also be deleted. Joint gifts for others are kept.",
              )
            )
              run(() =>
                change({ kind: "delete", collection: "recipients", id: r.id }),
              );
          },
          "gift-quiet",
        ),
        history(r),
      );
      root.append(card);
    }
    if (!displayed)
      root.append(
        node(
          "p",
          "empty",
          recipients.length
            ? "No recipients match this filter."
            : "Add your first recipient to start planning.",
        ),
      );
  }
  function editOccasion(o) {
    const which = scope;
    const ui = editor("Edit occasion", async () =>
      change(
        {
          kind: "put",
          collection: "occasions",
          id: o.id,
          before: o,
          mustExist: true,
          patch: {
            name: name.value.trim(),
            date: when.value,
            budget: G.money(budget.value),
            annual: annual.checked,
          },
        },
        which,
      ),
    );
    const name = field(ui.form, "Occasion name", "text", o.name, true),
      when = field(ui.form, "Date", "date", o.date, true),
      budget = field(
        ui.form,
        "Budget (£, optional)",
        "number",
        o.budget == null ? "" : o.budget / 100,
      ),
      annual = field(ui.form, "Repeat annually", "checkbox");
    annual.checked = o.annual;
    ui.finish();
  }
  function bind() {
    service = window.householdGifts;
    if (!service) return;
    service.subscribe((next) => {
      snapshot = next;
      if (!next.uid) {
        selectedId = null;
        expanded = null;
        if (modal.open) modal.close();
      }
      render();
    });
  }
  $("panelLists").append(
    button("🎁 Plan a gift from shopping", () => {
      HouseholdUI.show("gifts");
      shoppingEditor();
    }),
  );
  window.addEventListener("gifts-service-ready", bind);
  if (window.householdGifts) bind();
  window.GiftsUI = {
    render,
    addGift() {
      HouseholdUI.show("gifts");
      if (selectedId) {
        const r = V(data().recipients).find((r) => r.occasionId === selectedId);
        if (r) giftEditor(r.id);
        else recipientEditor();
      } else if (snapshot.ready[scope]) occasionEditor();
    },
  };
  render();
})();
