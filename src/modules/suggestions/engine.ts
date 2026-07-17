import { getD1 } from "@/db";
import type { HouseholdContext } from "@/src/modules/identity/context";
import { newId } from "@/src/shared/ids";
import { saveReminderRule, type ReminderRuleInput, ReminderValidationError } from "@/src/modules/reminders/commands";

export async function ensureSuggestions(context: HouseholdContext) {
  const d1 = getD1();
  await d1.prepare("UPDATE suggestions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE household_id = ? AND status = 'pending' AND expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP")
    .bind(context.householdId).run();
  const candidates: Array<{ type: string; evidence: object; action: ReminderRuleInput & { action: "save_reminder" }; explanation: string }> = [];

  const classes = await d1.prepare(
    "SELECT enrollments.id AS enrollmentId, enrollments.display_name AS enrollmentName, children.name AS childName FROM enrollments INNER JOIN children ON children.id = enrollments.child_id WHERE enrollments.household_id = ? AND enrollments.status = 'active' AND enrollments.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM reminder_rules WHERE reminder_rules.enrollment_id = enrollments.id AND reminder_rules.type = 'class') ORDER BY enrollments.created_at LIMIT 3",
  ).bind(context.householdId).all<{ enrollmentId: string; enrollmentName: string; childName: string }>();
  for (const row of classes.results) {
    candidates.push({
      type: "reminder_timing",
      evidence: { childName: row.childName, enrollmentName: row.enrollmentName, currentClassReminder: null },
      action: { action: "save_reminder", type: "class", enrollmentId: row.enrollmentId, leadMinutes: 60 },
      explanation: `A one-hour reminder for ${row.childName}'s ${row.enrollmentName} can leave time to travel or prepare. Nothing changes unless you accept.`,
    });
  }

  const overdue = await d1.prepare(
    "SELECT DISTINCT arrangements.id AS feeArrangementId, enrollments.display_name AS enrollmentName, children.name AS childName, MIN(charges.due_date) AS oldestDueDate FROM fee_charges charges INNER JOIN fee_arrangements arrangements ON arrangements.id = charges.fee_arrangement_id INNER JOIN enrollments ON enrollments.id = arrangements.enrollment_id INNER JOIN children ON children.id = enrollments.child_id WHERE enrollments.household_id = ? AND charges.status = 'due' AND charges.due_date < date('now') AND NOT EXISTS (SELECT 1 FROM reminder_rules WHERE reminder_rules.fee_arrangement_id = arrangements.id AND reminder_rules.type = 'fee_overdue') GROUP BY arrangements.id LIMIT 3",
  ).bind(context.householdId).all<{ feeArrangementId: string; enrollmentName: string; childName: string; oldestDueDate: string }>();
  for (const row of overdue.results) {
    candidates.push({
      type: "overdue_follow_up",
      evidence: { childName: row.childName, enrollmentName: row.enrollmentName, oldestDueDate: row.oldestDueDate },
      action: { action: "save_reminder", type: "fee_overdue", feeArrangementId: row.feeArrangementId, leadMinutes: 0, repeatIntervalMinutes: 4_320 },
      explanation: `${row.childName}'s ${row.enrollmentName} has an overdue fee. A three-day repeat can keep it visible until payment is recorded. Nothing changes unless you accept.`,
    });
  }

  for (const candidate of candidates) {
    const proposedActionJson = JSON.stringify(candidate.action);
    const existing = await d1.prepare("SELECT id FROM suggestions WHERE household_id = ? AND type = ? AND proposed_action_json = ? AND status IN ('pending', 'accepted') LIMIT 1")
      .bind(context.householdId, candidate.type, proposedActionJson).first();
    if (existing) continue;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
    await d1.prepare("INSERT INTO suggestions (id, household_id, type, evidence_json, proposed_action_json, explanation, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(newId("sug"), context.householdId, candidate.type, JSON.stringify(candidate.evidence), proposedActionJson, candidate.explanation, expiresAt).run();
  }
}

export async function getSuggestions(context: HouseholdContext) {
  const result = await getD1().prepare("SELECT id, type, evidence_json AS evidenceJson, proposed_action_json AS proposedActionJson, explanation, source, status, created_at AS createdAt FROM suggestions WHERE household_id = ? AND status = 'pending' ORDER BY created_at LIMIT 8")
    .bind(context.householdId).all<{ id: string; type: string; evidenceJson: string; proposedActionJson: string; explanation: string; source: string; status: string; createdAt: string }>();
  return result.results.map((row) => ({ ...row, evidence: safeJson(row.evidenceJson), proposedAction: safeJson(row.proposedActionJson) }));
}

export async function reviewSuggestion(context: HouseholdContext, suggestionId: string, decision: "accept" | "dismiss") {
  const d1 = getD1();
  const suggestion = await d1.prepare("SELECT id, type, evidence_json AS evidenceJson, proposed_action_json AS proposedActionJson, explanation, status FROM suggestions WHERE id = ? AND household_id = ?")
    .bind(suggestionId, context.householdId).first<{ id: string; type: string; evidenceJson: string; proposedActionJson: string; explanation: string; status: string }>();
  if (!suggestion) throw new ReminderValidationError("Suggestion not found.", 404);
  if (suggestion.status !== "pending") throw new ReminderValidationError("This suggestion has already been reviewed.", 409);

  if (decision === "dismiss") {
    await d1.batch([
      d1.prepare("UPDATE suggestions SET status = 'dismissed', reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(context.userId, suggestion.id),
      d1.prepare("INSERT INTO audit_events (id, household_id, actor_user_id, entity_type, entity_id, action, before_json, after_json) VALUES (?, ?, ?, 'suggestion', ?, 'dismiss', ?, ?)")
        .bind(newId("aud"), context.householdId, context.userId, suggestion.id, JSON.stringify({ status: "pending" }), JSON.stringify({ status: "dismissed" })),
    ]);
    return { suggestionId, status: "dismissed" };
  }

  const action = safeJson(suggestion.proposedActionJson) as ReminderRuleInput & { action?: string };
  if (action.action !== "save_reminder") throw new ReminderValidationError("This proposed action is no longer supported.", 409);
  const result = await saveReminderRule(context, action);
  await d1.batch([
    d1.prepare("UPDATE suggestions SET status = 'accepted', reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(context.userId, suggestion.id),
    d1.prepare("INSERT INTO audit_events (id, household_id, actor_user_id, entity_type, entity_id, action, before_json, after_json) VALUES (?, ?, ?, 'suggestion', ?, 'accept', ?, ?)")
      .bind(newId("aud"), context.householdId, context.userId, suggestion.id, JSON.stringify({ status: "pending", evidence: safeJson(suggestion.evidenceJson) }), JSON.stringify({ status: "accepted", applied: result })),
  ]);
  return { suggestionId, status: "accepted", applied: result };
}

function safeJson(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}
