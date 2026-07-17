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
