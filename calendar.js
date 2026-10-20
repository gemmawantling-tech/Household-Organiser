/* Calendar windows use local noon so daylight-saving changes do not move dates. */
(function (root) {
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function parse(value) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d, 12);
  }
  function windowFor(value, view) {
    const selected = parse(value),
      from = new Date(selected),
      to = new Date(selected);
    if (view === "week") {
      from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
      to.setTime(from.getTime());
      to.setDate(to.getDate() + 6);
    }
    if (view === "month") {
      from.setDate(1);
      from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
      to.setTime(from.getTime());
      to.setDate(to.getDate() + 41);
    }
    const days = [];
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1))
      days.push(iso(d));
    return { from: iso(from), to: iso(to), days };
  }
  function shift(value, view, direction) {
    const d = parse(value);
    if (view === "month") {
      const target = d.getMonth() + direction,
        day = d.getDate();
      d.setDate(1);
      d.setMonth(target);
      d.setDate(
        Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()),
      );
    } else d.setDate(d.getDate() + direction * (view === "week" ? 7 : 1));
    return iso(d);
  }
  function assignee(event) {
    return ["Gemma", "Ben", "Shared"].includes(event.assignee)
      ? event.assignee
      : "Shared";
  }
  root.HouseholdCalendar = { windowFor, shift, assignee };
})(globalThis);
