import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("build contains the ClassCue product shell", async () => {
  const [page, layout, styles, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    access(new URL("dist/server/index.js", root)),
  ]);

  assert.match(page, /Every class, calmly accounted for/);
  assert.match(page, /Sign in to ClassCue/);
  assert.match(layout, /ClassCue — Every class/);
  assert.match(styles, /--ink:\s*#12352d/);
  assert.match(packageJson, /"name": "classcue"/);
  assert.doesNotMatch(page + layout + packageJson, /codex-preview|react-loading-skeleton|Starter Project/);
});

test("first D1 migration preserves the vertical-slice boundaries", async () => {
  const migration = await readFile(new URL("drizzle/0000_dusty_sunfire.sql", root), "utf8");
  for (const table of [
    "users",
    "households",
    "household_members",
    "children",
    "contacts",
    "enrollments",
    "schedule_rules",
    "sessions",
    "attendance_records",
  ]) {
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.match(migration, /sessions_rule_date_uidx/);
  assert.match(migration, /providers_household_name_uidx/);
});

test("attendance keeps schedule, presence, and punctuality separate", async () => {
  const [route, query, ui] = await Promise.all([
    readFile(new URL("app/api/sessions/[sessionId]/attendance/route.ts", root), "utf8"),
    readFile(new URL("src/modules/today/queries.ts", root), "utf8"),
    readFile(new URL("app/ClassCueApp.tsx", root), "utf8"),
  ]);

  assert.match(route, /attendanceStatus !== "attended"/);
  assert.match(route, /punctuality = body\.punctuality === "late" \? "late" : "on_time"/);
  assert.match(route, /minutesLate < 1 \|\| minutesLate > 360/);
  assert.match(route, /session\.status !== "scheduled" && session\.status !== "makeup"/);
  assert.match(query, /attendanceRate:/);
  assert.match(query, /averageMinutesLate:/);
  assert.match(ui, /Schedule stays separate/);
  assert.match(ui, /Save .*minutes late/);
});
