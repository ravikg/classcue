import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import initialMigration from "@/drizzle/0000_dusty_sunfire.sql?raw";
import scheduleMigration from "@/drizzle/0001_tiresome_marten_broadcloak.sql?raw";
import sessionLocationMigration from "@/drizzle/0002_oval_cable.sql?raw";
import billingMigration from "@/drizzle/0003_cute_guardian.sql?raw";
import reminderMigration from "@/drizzle/0004_fixed_elektra.sql?raw";
import maintenanceMigration from "@/drizzle/0005_strange_sabretooth.sql?raw";
import pushMigration from "@/drizzle/0006_third_skrulls.sql?raw";
import * as schema from "./schema";

let initialization: Promise<void> | null = null;

export function getD1() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  return env.DB;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

export function ensureDatabase() {
  if (!initialization) {
    initialization = initializeDatabase(getD1());
  }

  return initialization;
}

async function initializeDatabase(d1: D1Database) {
  const initialStatements = idempotentCreateStatements(initialMigration);
  await d1.batch(initialStatements.map((statement) => d1.prepare(statement)));

  const compensationColumn = await d1
    .prepare("SELECT name FROM pragma_table_info('sessions') WHERE name = ?")
    .bind("compensation_status")
    .first();
  const scheduleStatements = idempotentCreateStatements(scheduleMigration).filter(
    (statement) =>
      !statement.startsWith("ALTER TABLE `sessions` ADD `compensation_status`") ||
      !compensationColumn,
  );
  if (scheduleStatements.length > 0) {
    await d1.batch(scheduleStatements.map((statement) => d1.prepare(statement)));
  }

  const sessionColumns = await d1.prepare("SELECT name FROM pragma_table_info('sessions')").all();
  const existingColumns = new Set(
    sessionColumns.results.map((column) => String((column as { name: unknown }).name)),
  );
  const locationStatements = sessionLocationMigration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(
      (statement) =>
        Boolean(statement) &&
        (!statement.includes("`location_override`") || !existingColumns.has("location_override")) &&
        (!statement.includes("`online_url_override`") || !existingColumns.has("online_url_override")),
    );
  if (locationStatements.length > 0) {
    await d1.batch(locationStatements.map((statement) => d1.prepare(statement)));
  }

  const billingStatements = idempotentCreateStatements(billingMigration);
  if (billingStatements.length > 0) {
    await d1.batch(billingStatements.map((statement) => d1.prepare(statement)));
  }

  const reminderStatements = idempotentCreateStatements(reminderMigration);
  if (reminderStatements.length > 0) {
    await d1.batch(reminderStatements.map((statement) => d1.prepare(statement)));
  }

  const maintenanceStatements = idempotentCreateStatements(maintenanceMigration);
  if (maintenanceStatements.length > 0) {
    await d1.batch(maintenanceStatements.map((statement) => d1.prepare(statement)));
  }

  const pushStatements = idempotentCreateStatements(pushMigration).filter((statement) => !statement.startsWith("ALTER TABLE"));
  if (pushStatements.length > 0) {
    await d1.batch(pushStatements.map((statement) => d1.prepare(statement)));
  }
  const reminderJobColumns = await d1.prepare("SELECT name FROM pragma_table_info('reminder_jobs') WHERE name = 'next_attempt_at'").all();
  if (reminderJobColumns.results.length === 0) {
    await d1.prepare("ALTER TABLE reminder_jobs ADD next_attempt_at text").run();
  }
}

function idempotentCreateStatements(migration: string) {
  return migration
    .replaceAll("CREATE TABLE `", "CREATE TABLE IF NOT EXISTS `")
    .replaceAll("CREATE INDEX `", "CREATE INDEX IF NOT EXISTS `")
    .replaceAll("CREATE UNIQUE INDEX `", "CREATE UNIQUE INDEX IF NOT EXISTS `")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}
