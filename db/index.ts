import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import initialMigration from "@/drizzle/0000_dusty_sunfire.sql?raw";
import scheduleMigration from "@/drizzle/0001_tiresome_marten_broadcloak.sql?raw";
import sessionLocationMigration from "@/drizzle/0002_oval_cable.sql?raw";
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
