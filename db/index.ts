import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import initialMigration from "@/drizzle/0000_dusty_sunfire.sql?raw";
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
    const d1 = getD1();
    const idempotentMigration = initialMigration
      .replaceAll("CREATE TABLE `", "CREATE TABLE IF NOT EXISTS `")
      .replaceAll("CREATE INDEX `", "CREATE INDEX IF NOT EXISTS `")
      .replaceAll("CREATE UNIQUE INDEX `", "CREATE UNIQUE INDEX IF NOT EXISTS `");
    const statements = idempotentMigration
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    initialization = d1.batch(statements.map((statement) => d1.prepare(statement))).then(() => undefined);
  }

  return initialization;
}
