import { and, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { enrollments, feeArrangements, reminderRules } from "@/db/schema";
import type { HouseholdContext } from "@/src/modules/identity/context";
import { addDays, localDateInZone, zonedLocalToUtc } from "@/src/shared/dates";
import { newId } from "@/src/shared/ids";

export class ReminderValidationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type ReminderRuleInput = {
  type?: "class" | "fee_due" | "fee_overdue";
  enrollmentId?: string | null;
  feeArrangementId?: string | null;
  leadMinutes?: number;
  repeatIntervalMinutes?: number | null;
};

export async function saveReminderRule(context: HouseholdContext, input: ReminderRuleInput) {
  const type = input.type;
  if (!type || !["class", "fee_due", "fee_overdue"].includes(type)) {
    throw new ReminderValidationError("Choose a valid reminder type.");
  }
  const leadMinutes = type === "fee_overdue" ? 0 : Number(input.leadMinutes);
  if (!Number.isInteger(leadMinutes) || leadMinutes < 0 || leadMinutes > 10_080) {
    throw new ReminderValidationError("Reminder timing must be between now and seven days before.");
  }
  const repeatIntervalMinutes = type === "fee_overdue" ? Number(input.repeatIntervalMinutes) : null;
  if (type === "fee_overdue" && (!Number.isInteger(repeatIntervalMinutes) || (repeatIntervalMinutes ?? 0) < 1_440 || (repeatIntervalMinutes ?? 0) > 43_200)) {
    throw new ReminderValidationError("Overdue reminders can repeat every 1 to 30 days.");
  }

  const db = getDb();
  let enrollmentId: string | null = null;
  let feeArrangementId: string | null = null;
  if (type === "class") {
    const [owned] = await db.select({ id: enrollments.id }).from(enrollments)
      .where(and(eq(enrollments.id, input.enrollmentId ?? ""), eq(enrollments.householdId, context.householdId))).limit(1);
    if (!owned) throw new ReminderValidationError("Class not found.", 404);
    enrollmentId = owned.id;
  } else {
    const [owned] = await db.select({ id: feeArrangements.id }).from(feeArrangements)
      .innerJoin(enrollments, eq(feeArrangements.enrollmentId, enrollments.id))
      .where(and(eq(feeArrangements.id, input.feeArrangementId ?? ""), eq(enrollments.householdId, context.householdId))).limit(1);
    if (!owned) throw new ReminderValidationError("Fee arrangement not found.", 404);
    feeArrangementId = owned.id;
  }

  const existing = await db.select({ id: reminderRules.id }).from(reminderRules).where(and(
    eq(reminderRules.householdId, context.householdId),
    eq(reminderRules.type, type),
    type === "class" ? eq(reminderRules.enrollmentId, enrollmentId!) : eq(reminderRules.feeArrangementId, feeArrangementId!),
  )).limit(1);
  const ruleId = existing[0]?.id ?? newId("rul");
  const d1 = getD1();
  if (existing[0]) {
    await d1.batch([
      d1.prepare("UPDATE reminder_rules SET lead_minutes = ?, repeat_interval_minutes = ?, enabled = 1, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND household_id = ?")
        .bind(leadMinutes, repeatIntervalMinutes, ruleId, context.householdId),
      d1.prepare("UPDATE reminder_jobs SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE rule_id = ? AND status = 'pending'").bind(ruleId),
    ]);
  } else {
    await d1.prepare("INSERT INTO reminder_rules (id, household_id, enrollment_id, fee_arrangement_id, type, lead_minutes, repeat_interval_minutes, timezone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(ruleId, context.householdId, enrollmentId, feeArrangementId, type, leadMinutes, repeatIntervalMinutes, context.timezone).run();
  }
  await generateReminderJobs(context);
  return { ruleId, type, leadMinutes, repeatIntervalMinutes };
}

export async function setReminderRuleEnabled(context: HouseholdContext, ruleId: string, enabled: boolean) {
  const d1 = getD1();
  const result = await d1.prepare("UPDATE reminder_rules SET enabled = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND household_id = ?")
    .bind(enabled ? 1 : 0, ruleId, context.householdId).run();
  if (result.meta.changes !== 1) throw new ReminderValidationError("Reminder rule not found.", 404);
  if (!enabled) {
    await d1.prepare("UPDATE reminder_jobs SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE rule_id = ? AND status = 'pending'").bind(ruleId).run();
  } else {
    await generateReminderJobs(context);
  }
  return { ruleId, enabled };
}

export async function generateReminderJobs(context: HouseholdContext) {
  const d1 = getD1();
  const rules = await d1.prepare("SELECT id, enrollment_id AS enrollmentId, fee_arrangement_id AS feeArrangementId, type, lead_minutes AS leadMinutes, repeat_interval_minutes AS repeatIntervalMinutes, timezone, enabled FROM reminder_rules WHERE household_id = ?")
    .bind(context.householdId).all<{ id: string; enrollmentId: string | null; feeArrangementId: string | null; type: string; leadMinutes: number; repeatIntervalMinutes: number | null; timezone: string; enabled: number }>();
  const statements: D1PreparedStatement[] = [];
  const now = new Date();
  const horizon = new Date(now.getTime() + 90 * 24 * 60 * 60_000).toISOString();
  const today = localDateInZone(now, context.timezone);

  for (const rule of rules.results) {
    if (!rule.enabled) continue;
    if (rule.type === "class" && rule.enrollmentId) {
      const sessionRows = await d1.prepare("SELECT id, planned_start_at AS plannedStartAt FROM sessions WHERE enrollment_id = ? AND planned_start_at >= ? AND planned_start_at <= ? AND status IN ('scheduled', 'makeup')")
        .bind(rule.enrollmentId, now.toISOString(), horizon).all<{ id: string; plannedStartAt: string }>();
      for (const session of sessionRows.results) {
        const scheduledFor = new Date(new Date(session.plannedStartAt).getTime() - rule.leadMinutes * 60_000).toISOString();
        statements.push(jobInsert(d1, rule.id, "session", session.id, scheduledFor));
      }
    }
    if (rule.type === "fee_due" && rule.feeArrangementId) {
      const charges = await d1.prepare("SELECT id, due_date AS dueDate FROM fee_charges WHERE fee_arrangement_id = ? AND status = 'due'")
        .bind(rule.feeArrangementId).all<{ id: string; dueDate: string }>();
      for (const charge of charges.results) {
        const dueAt = zonedLocalToUtc(charge.dueDate, "09:00", rule.timezone);
        const scheduledFor = new Date(dueAt.getTime() - rule.leadMinutes * 60_000).toISOString();
        statements.push(jobInsert(d1, rule.id, "fee_charge", charge.id, scheduledFor));
      }
    }
    if (rule.type === "fee_overdue" && rule.feeArrangementId && rule.repeatIntervalMinutes) {
      const charges = await d1.prepare("SELECT id, due_date AS dueDate FROM fee_charges WHERE fee_arrangement_id = ? AND status = 'due' AND due_date < ?")
        .bind(rule.feeArrangementId, today).all<{ id: string; dueDate: string }>();
      for (const charge of charges.results) {
        const anchor = zonedLocalToUtc(addDays(charge.dueDate, 1), "09:00", rule.timezone).getTime();
        const interval = rule.repeatIntervalMinutes * 60_000;
        const firstIndex = Math.max(0, Math.floor((now.getTime() - anchor) / interval));
        for (let index = firstIndex; index <= firstIndex + 3; index += 1) {
          statements.push(jobInsert(d1, rule.id, "fee_charge", charge.id, new Date(anchor + index * interval).toISOString()));
        }
      }
    }
  }

  await d1.batch([
    d1.prepare("UPDATE reminder_jobs SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE status = 'pending' AND rule_id IN (SELECT id FROM reminder_rules WHERE household_id = ? AND enabled = 0)").bind(context.householdId),
    d1.prepare("UPDATE reminder_jobs SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE status = 'pending' AND related_record_type = 'session' AND related_record_id IN (SELECT sessions.id FROM sessions INNER JOIN enrollments ON enrollments.id = sessions.enrollment_id WHERE enrollments.household_id = ? AND sessions.status NOT IN ('scheduled', 'makeup'))").bind(context.householdId),
    d1.prepare("UPDATE reminder_jobs SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE status = 'pending' AND related_record_type = 'fee_charge' AND related_record_id IN (SELECT charges.id FROM fee_charges charges INNER JOIN fee_arrangements arrangements ON arrangements.id = charges.fee_arrangement_id INNER JOIN enrollments ON enrollments.id = arrangements.enrollment_id WHERE enrollments.household_id = ? AND charges.status <> 'due')").bind(context.householdId),
  ]);
  for (let index = 0; index < statements.length; index += 50) {
    await d1.batch(statements.slice(index, index + 50));
  }
  return statements.length;
}

function jobInsert(d1: D1Database, ruleId: string, recordType: string, recordId: string, scheduledFor: string) {
  return d1.prepare("INSERT INTO reminder_jobs (id, rule_id, related_record_type, related_record_id, scheduled_for) VALUES (?, ?, ?, ?, ?) ON CONFLICT(rule_id, related_record_id, scheduled_for) DO UPDATE SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE reminder_jobs.status = 'cancelled'")
    .bind(newId("job"), ruleId, recordType, recordId, scheduledFor);
}
