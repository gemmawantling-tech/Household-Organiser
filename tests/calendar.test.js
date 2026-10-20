import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const c = vm.createContext({ Date });
vm.runInContext(readFileSync("calendar.js", "utf8"), c);
const cal = c.HouseholdCalendar;
test("calendar windows cover a day, Monday-based week and 42-cell month across years", () => {
  assert.equal(cal.windowFor("2026-12-31", "day").days.length, 1);
  const week = cal.windowFor("2027-01-01", "week");
  assert.equal(week.from, "2026-12-28");
  assert.equal(week.to, "2027-01-03");
  const month = cal.windowFor("2026-02-01", "month");
  assert.equal(month.days.length, 42);
  assert.equal(month.from, "2026-01-26");
});
test("month navigation clamps dates and day navigation crosses years", () => {
  assert.equal(cal.shift("2026-01-31", "month", 1), "2026-02-28");
  assert.equal(cal.shift("2028-01-31", "month", 1), "2028-02-29");
  assert.equal(cal.shift("2026-12-31", "day", 1), "2027-01-01");
  assert.equal(cal.shift("2026-12-31", "week", 1), "2027-01-07");
});
test("legacy events default to Shared without mutating their records", () => {
  const event = { title: "Existing" };
  assert.equal(cal.assignee(event), "Shared");
  assert.equal(cal.assignee({ assignee: "Ben" }), "Ben");
  assert.deepEqual(event, { title: "Existing" });
});
