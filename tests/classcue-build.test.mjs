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

test("schedule exceptions preserve history and link replacements", async () => {
  const [linksMigration, locationMigration, sessionChange, recurrenceChange, ui] = await Promise.all([
    readFile(new URL("drizzle/0001_tiresome_marten_broadcloak.sql", root), "utf8"),
    readFile(new URL("drizzle/0002_oval_cable.sql", root), "utf8"),
    readFile(new URL("src/modules/scheduling/change-session.ts", root), "utf8"),
    readFile(new URL("src/modules/scheduling/change-recurrence.ts", root), "utf8"),
    readFile(new URL("app/ClassCueApp.tsx", root), "utf8"),
  ]);

  assert.match(linksMigration, /CREATE TABLE `session_links`/);
  assert.match(linksMigration, /compensation_status/);
  assert.match(locationMigration, /location_override/);
  assert.match(sessionChange, /attendanceSessionId/);
  assert.match(sessionChange, /originalStatus/);
  assert.match(sessionChange, /INSERT INTO session_links/);
  assert.match(recurrenceChange, /superseded_at = CURRENT_TIMESTAMP/);
  assert.match(recurrenceChange, /source = 'recurrence'/);
  assert.match(recurrenceChange, /NOT EXISTS \(SELECT 1 FROM attendance_records/);
  assert.match(ui, /This session only/);
  assert.match(ui, /This and future sessions/);
  assert.match(ui, /Makeup still owed/);
});

test("fees keep suggestions, parent adjustments, currencies, and payments auditable", async () => {
  const [migration, commands, paymentRoute, query, attendanceRoute, ui] = await Promise.all([
    readFile(new URL("drizzle/0003_cute_guardian.sql", root), "utf8"),
    readFile(new URL("src/modules/fees/commands.ts", root), "utf8"),
    readFile(new URL("app/api/fee-charges/[chargeId]/payments/route.ts", root), "utf8"),
    readFile(new URL("src/modules/fees/queries.ts", root), "utf8"),
    readFile(new URL("app/api/sessions/[sessionId]/attendance/route.ts", root), "utf8"),
    readFile(new URL("app/ClassCueApp.tsx", root), "utf8"),
  ]);

  for (const table of ["fee_arrangements", "fee_charges", "fee_adjustments", "payments", "session_credit_entries"]) {
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.match(commands, /new Set\(\["monthly", "term", "package", "per_session"\]\)/);
  assert.match(commands, /previous paid amount/);
  assert.match(commands, /Explain why the confirmed amount differs/);
  assert.match(paymentRoute, /Payment cannot exceed the outstanding amount/);
  assert.match(paymentRoute, /INSERT OR IGNORE INTO session_credit_entries/);
  assert.match(query, /dueAmountMinor/);
  assert.match(query, /paidAmountMinor/);
  assert.match(attendanceRoute, /'use', -1/);
  assert.match(ui, /How ClassCue calculated it/);
  assert.match(ui, /Partial payments are supported/);
});

test("reminders are idempotent, household scoped, and stop when fees are paid", async () => {
  const [migration, commands, reminderQuery, paymentRoute, worker] = await Promise.all([
    readFile(new URL("drizzle/0004_fixed_elektra.sql", root), "utf8"),
    readFile(new URL("src/modules/reminders/commands.ts", root), "utf8"),
    readFile(new URL("src/modules/reminders/queries.ts", root), "utf8"),
    readFile(new URL("app/api/fee-charges/[chargeId]/payments/route.ts", root), "utf8"),
    readFile(new URL("public/classcue-sw.js", root), "utf8"),
  ]);

  for (const table of ["reminder_rules", "reminder_jobs", "suggestions", "audit_events"]) {
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.match(migration, /reminder_jobs_idempotency_uidx/);
  assert.match(commands, /ON CONFLICT\(rule_id, related_record_id, scheduled_for\)/);
  assert.match(commands, /status = 'cancelled'/);
  assert.match(reminderQuery, /rules\.household_id = \?/);
  assert.match(paymentRoute, /UPDATE reminder_jobs SET status = 'cancelled'/);
  assert.match(worker, /notificationclick/);
  assert.match(worker, /addEventListener\("push"/);
});

test("suggestions require explicit parent review and use the normal reminder command", async () => {
  const [engine, reviewRoute, ui] = await Promise.all([
    readFile(new URL("src/modules/suggestions/engine.ts", root), "utf8"),
    readFile(new URL("app/api/suggestions/[suggestionId]/review/route.ts", root), "utf8"),
    readFile(new URL("app/ClassCueApp.tsx", root), "utf8"),
  ]);

  assert.match(engine, /saveReminderRule\(context, action\)/);
  assert.match(engine, /INSERT INTO audit_events/);
  assert.match(reviewRoute, /decision !== "accept" && body\.decision !== "dismiss"/);
  assert.match(ui, /Rule engine · not generative AI/);
  assert.match(ui, /Saving creates or updates this one rule/);
  assert.match(ui, /ClassCue checks for due reminders while the app is open/);
});

test("contacts are reusable and one primary teacher is enforced per class", async () => {
  const [migration, maintenance, enrollmentRoute, ui] = await Promise.all([
    readFile(new URL("drizzle/0005_strange_sabretooth.sql", root), "utf8"),
    readFile(new URL("src/modules/household/maintenance.ts", root), "utf8"),
    readFile(new URL("app/api/enrollments/route.ts", root), "utf8"),
    readFile(new URL("app/ClassCueApp.tsx", root), "utf8"),
  ]);

  assert.match(migration, /enrollment_contacts_primary_teacher_uidx/);
  assert.match(migration, /role.*teacher.*is_primary/s);
  assert.match(maintenance, /UPDATE enrollment_contacts SET is_primary = 0/);
  assert.match(maintenance, /ON CONFLICT\(enrollment_id, contact_id, role\)/);
  assert.match(maintenance, /contacts\.household_id = \?/);
  assert.match(enrollmentRoute, /teacherContactId/);
  assert.match(ui, /Reuse a saved teacher/);
  assert.match(ui, /Payment support/);
});

test("class archiving preserves history, stops the future, and can be restored", async () => {
  const [maintenance, todayQuery, bootstrap, ui] = await Promise.all([
    readFile(new URL("src/modules/household/maintenance.ts", root), "utf8"),
    readFile(new URL("src/modules/today/queries.ts", root), "utf8"),
    readFile(new URL("app/api/bootstrap/route.ts", root), "utf8"),
    readFile(new URL("app/ClassCueApp.tsx", root), "utf8"),
  ]);

  assert.match(maintenance, /SET status = 'archived', archived_at = CURRENT_TIMESTAMP/);
  assert.match(maintenance, /reason = 'Enrollment archived'/);
  assert.match(maintenance, /UPDATE fee_arrangements SET status = 'archived'/);
  assert.match(maintenance, /INSERT INTO audit_events/);
  assert.match(maintenance, /SET status = 'active', archived_at = NULL/);
  assert.match(maintenance, /generateSessions/);
  assert.match(todayQuery, /session\.enrollmentStatus === "active"/);
  assert.match(bootstrap, /archivedEnrollments/);
  assert.match(ui, /Attendance, fees, payments, and contact history remain available/);
});

test("household and record maintenance remains server scoped and phone accessible", async () => {
  const [maintenance, childRoute, householdRoute, ui, styles] = await Promise.all([
    readFile(new URL("src/modules/household/maintenance.ts", root), "utf8"),
    readFile(new URL("app/api/children/[childId]/route.ts", root), "utf8"),
    readFile(new URL("app/api/household/route.ts", root), "utf8"),
    readFile(new URL("app/ClassCueApp.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(maintenance, /new Intl\.DateTimeFormat\("en", \{ timeZone: timezone \}\)/);
  assert.match(maintenance, /version = version \+ 1/);
  assert.match(childRoute, /requireApiContext/);
  assert.match(householdRoute, /requireApiContext/);
  assert.match(ui, /Edit household settings/);
  assert.match(ui, /Online-class link/);
  assert.match(styles, /\.contact-card/);
});

test("the phone experience is installable and keeps private app data out of caches", async () => {
  const [manifest, layout, worker, ui, styles] = await Promise.all([
    readFile(new URL("app/manifest.ts", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("public/classcue-sw.js", root), "utf8"),
    readFile(new URL("app/ClassCueApp.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    access(new URL("public/icon-192.png", root)),
    access(new URL("public/icon-512.png", root)),
    access(new URL("public/apple-touch-icon.png", root)),
  ]);

  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /portrait-primary/);
  assert.match(layout, /appleWebApp/);
  assert.match(worker, /skipWaiting/);
  assert.doesNotMatch(worker, /caches\.open|cache\.put/);
  assert.match(ui, /beforeinstallprompt/);
  assert.match(ui, /Add to Home Screen/);
  assert.match(ui, /aria-current/);
  assert.match(ui, /event\.key === "Escape"/);
  assert.match(styles, /focus-visible/);
});
