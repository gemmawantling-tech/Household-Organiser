/* Presentation layer: existing task/calendar records stay in their current shape. */
(function () {
  let view = "today",
    calendarView = "month";
  const main = $("householdApp"),
    header = main.querySelector("header");
  header.classList.add("app-header");
  header.querySelector("h1").textContent = "Household Organiser";
  header.querySelector(".sub").textContent = "A calmer day, together.";
  const eyebrow = el("div", "eyebrow", "OUR HOUSEHOLD");
  header.prepend(eyebrow);
  const titleBlock = el("div");
  titleBlock.append(...header.childNodes);
  header.append(titleBlock);
  main.prepend(header);
  function panel(name) {
    const section = el("section");
    section.id = "panel" + name;
    section.setAttribute("aria-label", name);
    section.tabIndex = -1;
    main.append(section);
    return section;
  }
  const today = panel("Today"),
    calendar = panel("Calendar"),
    lists = panel("Lists"),
    more = panel("More"),
    audit = panel("Audit");
  const summary = el("section", "summary-strip");
  summary.id = "homeSummary";
  summary.setAttribute("aria-label", "Today at a glance");
  summary.innerHTML =
    '<div><strong id="outstandingCount">0</strong><p>tasks & routines left</p></div><div class="summary-right"><strong id="todayPlanCount">0</strong><p>events planned</p></div>';
  const dateTools = document.createElement("details");
  dateTools.id = "dateControls";
  dateTools.append(el("summary", "", "Choose another date"));
  for (const child of [...$("dateCard").children].slice(1))
    dateTools.append(child);
  $("dateCard").append(summary, dateTools);
  today.append(
    $("dateCard"),
    $("peopleCard"),
    $("focusCard"),
    $("eventsCard"),
    $("routinesProgress"),
    $("sections"),
  );
  const plans = el("details", "card");
  plans.id = "weekPlan";
  plans.append(
    el("summary", "", "Upcoming & reminders"),
    $("priorityCard"),
    $("upcomingCard"),
  );
  today.append(plans);
  calendar.innerHTML =
    '<h2 class="view-title">Family calendar</h2><section class="card"><div class="calendar-head"><button id="calendarPrev" aria-label="Previous calendar period">‹</button><h2 id="calendarTitle"></h2><button id="calendarNext" aria-label="Next calendar period">›</button></div><div class="segmented" role="group" aria-label="Calendar view"><button data-calendar-view="day">Day</button><button data-calendar-view="week">Week</button><button data-calendar-view="month">Month</button></div><div class="row"><button id="calendarToday">Today</button><p id="calendarHint" class="notice">Tap a date or event to open it.</p></div><div id="calendarGrid"></div><div id="calendarAgenda"></div></section>';
  lists.append(el("h2", "view-title", "Lists & supplies"), $("shoppingCard"));
  more.append(el("h2", "view-title", "Your household"));
  const tools = el("section", "card settings-links");
  tools.innerHTML =
    '<button id="openAudit">Monthly preparedness audit</button><button id="checkUpdates">Check for app updates</button><a href="./Family/">Earlier Family view</a>';
  more.append(tools, $("backupCard"));
  const legacyNotice=el("p","settings-note","A snapshot from the previous app was kept in Backups below. Review it if any earlier device-only edits are missing.");legacyNotice.id="legacyRecoveryNotice";legacyNotice.hidden=true;$("backupCard").prepend(legacyNotice);
  const recoveries = el("details");
  recoveries.id = "recoveryDownloads";
  $("backupCard").append(recoveries);
  const account = el("section", "card");
  account.innerHTML =
    '<h2>Shared access</h2><p class="notice">Everyone uses their own verified account. Share invitation links privately.</p><div id="accountActions"></div>';
  more.append(account);
  $("accountActions").append(
    $("inviteBtn"),
    ...main.querySelectorAll("#cloudBanner .signOutBtn"),
  );
  const offlineNote = el(
    "p",
    "settings-note",
    "Task and shopping edits are queued on this device while offline. Calendar edits and attachments need a connection.",
  );
  offlineNote.id = "offlineCapability";
  more.append(offlineNote);
  const release = el("p", "release-label", "Household Organiser · 2026.10");
  more.append(release);
  audit.append(el("h2", "view-title", "Monthly audit"));
  $("dailyTab").hidden = true;
  $("monthlyTab").hidden = true;
  const nav = el("nav", "bottom-nav");
  nav.setAttribute("aria-label", "Main navigation");
  nav.innerHTML =
    '<button data-view="today"><span class="nav-icon" aria-hidden="true">⌂</span>Today</button><button data-view="calendar"><span class="nav-icon" aria-hidden="true">▦</span>Calendar</button><button id="globalAdd" aria-label="Add task or event"><span class="nav-icon" aria-hidden="true">＋</span>Add</button><button data-view="lists"><span class="nav-icon" aria-hidden="true">☷</span>Lists</button><button data-view="more"><span class="nav-icon" aria-hidden="true">•••</span>More</button>';
  main.append(nav);
  const addSheet = document.createElement("dialog");
  addSheet.id = "addSheet";
  addSheet.setAttribute("aria-labelledby", "addSheetTitle");
  addSheet.innerHTML =
    '<h2 id="addSheetTitle">What would you like to add?</h2><p class="muted">A job to do, or a date to remember.</p><div class="stack"><button id="addTaskChoice">✓ &nbsp; Task or reminder</button><button id="addEventChoice">▦ &nbsp; Event, birthday or booking</button></div><button class="sheet-close" id="closeAddSheet">Cancel</button>';
  document.body.append(addSheet);
  $("globalAdd").onclick = () => addSheet.showModal();
  $("closeAddSheet").onclick = () => addSheet.close();
  $("addTaskChoice").onclick = () => {
    addSheet.close();
    openEditor("job");
  };
  $("addEventChoice").onclick = () => {
    addSheet.close();
    openEditor("event");
  };
  const viewPanels = { today, calendar, lists, more, audit };
  function show(name) {
    view = name;
    if (name === "today") selected = parseISO(iso(new Date()));
    monthly = name === "audit";
    if (monthly) {
      audit.append($("routinesProgress"), $("sections"));
    } else {
      today.insertBefore($("routinesProgress"), plans);
      today.insertBefore($("sections"), plans);
    }
    render();
    document.title =
      "Household Organiser · " + name.charAt(0).toUpperCase() + name.slice(1);
    viewPanels[name].focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  nav
    .querySelectorAll("[data-view]")
    .forEach((b) => (b.onclick = () => show(b.dataset.view)));
  $("openAudit").onclick = () => show("audit");
  function eventCard(event) {
    const row = el("article", "event"),
      button = el(
        "button",
        "event-open",
        (event.time ? event.time + " · " : "") + event.title,
      );
    button.onclick = () => openEvent(event.id);
    row.append(button);
    const meta = el("div", "event-meta");
    meta.append(ownerBadge("span", "tag", HouseholdCalendar.assignee(event)));
    if (event.repeat && event.repeat !== "none")
      meta.append(
        el(
          "span",
          "muted",
          event.repeat === "yearly"
            ? "Every year"
            : event.repeat === "weekly"
              ? "Every week"
              : "Every month",
        ),
      );
    if (event.attachments?.length)
      meta.append(
        el(
          "span",
          "muted",
          event.attachments.length +
            " attachment" +
            (event.attachments.length === 1 ? "" : "s"),
        ),
      );
    row.append(meta);
    if (event.location) row.append(el("p", "muted", event.location));
    return row;
  }
  function agenda(container, when, events) {
    const section = el("section", "calendar-day");
    section.append(
      el(
        "h3",
        "",
        parseISO(when).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "short",
        }),
      ),
    );
    const dayEvents = events.filter((e) => e.date === when);
    for (const event of dayEvents) section.append(eventCard(event));
    if (!dayEvents.length)
      section.append(el("p", "empty", "No events planned."));
    container.append(section);
  }
  function renderCalendar() {
    const period = HouseholdCalendar.windowFor(date(), calendarView),
      events = HouseholdEvents.between(state.events, period.from, period.to),
      grid = $("calendarGrid"),
      list = $("calendarAgenda");
    grid.replaceChildren();
    list.replaceChildren();
    $("calendarTitle").textContent = selected.toLocaleDateString(
      "en-GB",
      calendarView === "day"
        ? { day: "numeric", month: "long" }
        : { month: "long", year: "numeric" },
    );
    calendar.querySelectorAll("[data-calendar-view]").forEach((b) => {
      const active = b.dataset.calendarView === calendarView;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    if (calendarView === "month") {
      grid.className = "month-grid";
      for (const label of ["M", "T", "W", "T", "F", "S", "S"])
        grid.append(el("span", "weekday", label));
      for (const when of period.days) {
        const d = parseISO(when),
          found = events.filter((e) => e.date === when),
          button = el("button", "month-day", d.getDate());
        button.classList.toggle(
          "outside",
          d.getMonth() !== selected.getMonth(),
        );
        button.classList.toggle("is-today", when === iso(new Date()));
        button.setAttribute("aria-pressed", String(when === date()));
        button.setAttribute(
          "aria-label",
          d.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }) +
            ", " +
            found.length +
            " events",
        );
        if (found.length) {
          const dot = el("span", "event-dot");
          dot.setAttribute("aria-hidden", "true");
          button.append(dot);
        }
        button.onclick = () => goto(when);
        grid.append(button);
      }
      agenda(list, date(), events);
    } else {
      grid.className = "";
      list.className = calendarView === "week" ? "calendar-week" : "";
      for (const when of period.days) agenda(list, when, events);
    }
  }
  calendar.querySelectorAll("[data-calendar-view]").forEach(
    (b) =>
      (b.onclick = () => {
        calendarView = b.dataset.calendarView;
        renderCalendar();
      }),
  );
  $("calendarPrev").onclick = () =>
    goto(HouseholdCalendar.shift(date(), calendarView, -1));
  $("calendarNext").onclick = () =>
    goto(HouseholdCalendar.shift(date(), calendarView, 1));
  $("calendarToday").onclick = () => goto(iso(new Date()));
  function refresh() {
    $("focusCard").querySelector("h2").textContent =
      date() === iso(new Date())
        ? "Today’s outstanding jobs"
        : "Jobs for " +
          selected.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          });
    recoveries.replaceChildren();
    recoveries.append(el("summary", "", "Download earlier device snapshots"));
    try {
      const prefix = "household-recovery:" + window.householdScope + ":",
        keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (window.householdScope && key.startsWith(prefix)) keys.push(key);
      }
      for (const key of keys.sort().reverse().slice(0, 5)) {
        const download = el(
          "button",
          "",
          "Before import · " +
            new Date(Number(key.slice(prefix.length))).toLocaleString("en-GB"),
        );
        download.onclick = () => {
          const url = URL.createObjectURL(
              new Blob([localStorage.getItem(key)], {
                type: "application/json",
              }),
            ),
            a = el("a");
          a.href = url;
          a.download = "household-recovery.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
        };
        recoveries.append(download);
      }
      if (!keys.length)
        recoveries.append(
          el(
            "p",
            "notice",
            "Snapshots are saved here before an approved import.",
          ),
        );
    } catch {
      recoveries.append(el("p", "notice", "Device snapshots are unavailable."));
    }
    for (const [name, p] of Object.entries(viewPanels))
      p.hidden = name !== view;
    nav.querySelectorAll("[data-view]").forEach((b) => {
      const active = b.dataset.view === (view === "audit" ? "more" : view);
      if (active) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    let count = 0;
    for (const section of sections)
      count += itemsFor(section, date()).filter(
        (item) => !state.completed[taskKey(item, section, date())],
      ).length;
    count += carriedItems().length;
    $("outstandingCount").textContent = count;
    $("todayPlanCount").textContent = HouseholdEvents.between(
      state.events,
      date(),
      date(),
    ).length;
    if (view === "calendar") renderCalendar();
  }
  window.HouseholdUI = { refresh, show, eventCard };
  $("checkUpdates").onclick = async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (!reg) {
        $("checkUpdates").textContent = "Open online to check for updates";
        return;
      }
      await reg.update();
      $("checkUpdates").textContent = reg.waiting
        ? "Update ready — use the banner above"
        : "Update check complete";
    } catch {
      $("checkUpdates").textContent = "Could not check — try when online";
    }
  };
  refresh();
})();
