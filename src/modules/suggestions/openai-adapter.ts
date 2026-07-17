import { getD1 } from "@/db";
import type { HouseholdContext } from "@/src/modules/identity/context";
import { newId } from "@/src/shared/ids";

export type OpenAIEnvironment = { OPENAI_API_KEY?: string; OPENAI_MODEL?: string };

type Target = {
  key: string;
  kind: "class" | "fee";
  recordId: string;
  localLabel: string;
  facts: Record<string, string | number | boolean | null>;
};

type ModelSuggestion = {
  type: "attendance_pattern" | "punctuality_pattern" | "fee_explanation" | "reminder_timing";
  subjectKey: string;
  explanation: string;
  evidence: string[];
  proposedAction: {
    action: "none" | "save_reminder";
    reminderType: "none" | "class" | "fee_due" | "fee_overdue";
    targetKey: string;
    leadMinutes: number;
    repeatIntervalMinutes: number;
  };
};

export class AIUnavailableError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}

export async function generateOpenAISuggestions(context: HouseholdContext, environment: OpenAIEnvironment) {
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new AIUnavailableError("OpenAI suggestions are not connected yet.");
  const model = environment.OPENAI_MODEL?.trim() || "gpt-5.6-sol";
  const d1 = getD1();
  const recent = await d1.prepare("SELECT 1 AS recent FROM audit_events WHERE household_id = ? AND entity_type = 'ai_generation' AND occurred_at >= datetime('now', '-10 minutes') LIMIT 1")
    .bind(context.householdId).first();
  if (recent) throw new AIUnavailableError("AI insights were refreshed recently. Try again in a few minutes.", 429);
  const runId = newId("air");
  await d1.prepare("INSERT INTO audit_events (id, household_id, actor_user_id, entity_type, entity_id, action, after_json) VALUES (?, ?, ?, 'ai_generation', ?, 'requested', ?)")
    .bind(newId("aud"), context.householdId, context.userId, runId, JSON.stringify({ model, dataPolicy: "pseudonymous_aggregates" })).run();
  const targets = await suggestionTargets(context);
  if (targets.length === 0) return { created: 0, model };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: 1_200,
      instructions: "You help a parent notice useful class-management patterns. Use only the supplied facts. Never infer diagnoses, ability, blame, or causes. Return zero to three concise suggestions. Prefer a useful factual explanation over a proposed action. A reminder proposal is allowed only when its target exists in the input. Nothing you return is applied automatically.",
      input: JSON.stringify({ window: "recent recorded data and current fees", targets: targets.map(({ key, kind, facts }) => ({ key, kind, facts })) }),
      text: { format: { type: "json_schema", name: "classcue_suggestions", strict: true, schema: suggestionSchema } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.json() as OpenAIResponse;
  if (!response.ok) throw new AIUnavailableError("OpenAI could not generate suggestions right now.", response.status >= 500 ? 503 : 502);
  const outputText = raw.output_text ?? raw.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new AIUnavailableError("OpenAI returned no usable suggestions.", 502);
  const parsed = safeModelOutput(outputText);
  return { created: await persistSuggestions(context, model, targets, parsed.suggestions), model };
}

async function suggestionTargets(context: HouseholdContext): Promise<Target[]> {
  const d1 = getD1();
  const [classes, fees] = await Promise.all([
    d1.prepare(
      "SELECT enrollments.id, COUNT(attendance.id) AS recorded, SUM(CASE WHEN attendance.attendance_status = 'attended' THEN 1 ELSE 0 END) AS attended, SUM(CASE WHEN attendance.attendance_status = 'absent' THEN 1 ELSE 0 END) AS absent, SUM(CASE WHEN attendance.punctuality = 'late' THEN 1 ELSE 0 END) AS late, COALESCE(ROUND(AVG(CASE WHEN attendance.punctuality = 'late' THEN attendance.minutes_late END)), 0) AS averageMinutesLate, COUNT(CASE WHEN sessions.status = 'cancelled' THEN 1 END) AS cancelled, children.name AS childName, enrollments.display_name AS enrollmentName FROM enrollments INNER JOIN children ON children.id = enrollments.child_id LEFT JOIN sessions ON sessions.enrollment_id = enrollments.id AND sessions.local_date >= date('now', '-90 days') LEFT JOIN attendance_records attendance ON attendance.session_id = sessions.id WHERE enrollments.household_id = ? AND enrollments.status = 'active' GROUP BY enrollments.id ORDER BY children.created_at, enrollments.created_at LIMIT 12",
    ).bind(context.householdId).all<{ id: string; recorded: number; attended: number; absent: number; late: number; averageMinutesLate: number; cancelled: number; childName: string; enrollmentName: string }>(),
    d1.prepare(
      "SELECT arrangements.id, arrangements.model, arrangements.currency, arrangements.base_amount_minor AS baseAmountMinor, arrangements.sessions_included AS sessionsIncluded, arrangements.compensation_policy AS compensationPolicy, children.name AS childName, enrollments.display_name AS enrollmentName, COUNT(charges.id) AS chargeCount, SUM(CASE WHEN charges.status = 'due' THEN 1 ELSE 0 END) AS dueCount, COALESCE(SUM(CASE WHEN charges.status = 'due' THEN charges.confirmed_amount_minor ELSE 0 END), 0) AS dueAmountMinor, COALESCE(SUM(CASE WHEN charges.status = 'paid' THEN charges.confirmed_amount_minor ELSE 0 END), 0) AS paidAmountMinor, SUM(CASE WHEN charges.status = 'due' AND charges.due_date < date('now') THEN 1 ELSE 0 END) AS overdueCount FROM fee_arrangements arrangements INNER JOIN enrollments ON enrollments.id = arrangements.enrollment_id INNER JOIN children ON children.id = enrollments.child_id LEFT JOIN fee_charges charges ON charges.fee_arrangement_id = arrangements.id WHERE enrollments.household_id = ? AND arrangements.status = 'active' GROUP BY arrangements.id ORDER BY children.created_at, enrollments.created_at LIMIT 12",
    ).bind(context.householdId).all<{ id: string; model: string; currency: string; baseAmountMinor: number; sessionsIncluded: number | null; compensationPolicy: string; childName: string; enrollmentName: string; chargeCount: number; dueCount: number; dueAmountMinor: number; paidAmountMinor: number; overdueCount: number }>(),
  ]);
  const classTargets = classes.results.map((row, index): Target => ({
    key: `class_${index + 1}`, kind: "class", recordId: row.id, localLabel: `${row.childName} · ${row.enrollmentName}`,
    facts: { recordedAttendance: row.recorded, attended: row.attended, absent: row.absent, lateArrivals: row.late, averageMinutesLate: row.averageMinutesLate, cancelledSessions: row.cancelled, hasClassReminder: false },
  }));
  const feeTargets = fees.results.map((row, index): Target => ({
    key: `fee_${index + 1}`, kind: "fee", recordId: row.id, localLabel: `${row.childName} · ${row.enrollmentName}`,
    facts: { model: row.model, currency: row.currency, baseAmountMinor: row.baseAmountMinor, sessionsIncluded: row.sessionsIncluded, compensationPolicy: row.compensationPolicy, chargeCount: row.chargeCount, dueCount: row.dueCount, dueAmountMinor: row.dueAmountMinor, paidAmountMinor: row.paidAmountMinor, overdueCount: row.overdueCount },
  }));
  return [...classTargets, ...feeTargets];
}

async function persistSuggestions(context: HouseholdContext, model: string, targets: Target[], suggestions: ModelSuggestion[]) {
  const d1 = getD1();
  let created = 0;
  for (const item of suggestions.slice(0, 3)) {
    const target = targets.find((candidate) => candidate.key === item.subjectKey);
    if (!target) continue;
    const proposedAction = validatedAction(item.proposedAction, target, targets);
    const explanation = boundedText(item.explanation, 700);
    if (!explanation) continue;
    const evidence = item.evidence.slice(0, 5).map((value) => boundedText(value, 180)).filter(Boolean);
    const proposedActionJson = JSON.stringify(proposedAction);
    const duplicate = await d1.prepare("SELECT id FROM suggestions WHERE household_id = ? AND source = ? AND type = ? AND proposed_action_json = ? AND explanation = ? AND status IN ('pending', 'accepted') LIMIT 1")
      .bind(context.householdId, `openai:${model}`, item.type, proposedActionJson, explanation).first();
    if (duplicate) continue;
    await d1.prepare("INSERT INTO suggestions (id, household_id, type, evidence_json, proposed_action_json, explanation, source, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(newId("sug"), context.householdId, item.type, JSON.stringify({ targetName: target.localLabel, facts: target.facts, evidence, modelGenerated: true }), proposedActionJson, explanation, `openai:${model}`, new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString()).run();
    created += 1;
  }
  return created;
}

function validatedAction(action: ModelSuggestion["proposedAction"], subject: Target, targets: Target[]) {
  if (action.action !== "save_reminder") return { action: "none" };
  const target = targets.find((candidate) => candidate.key === action.targetKey);
  if (!target || target.recordId !== subject.recordId) return { action: "none" };
  if (action.reminderType === "class" && target.kind === "class" && Number.isInteger(action.leadMinutes) && action.leadMinutes >= 0 && action.leadMinutes <= 10_080) {
    return { action: "save_reminder", type: "class", enrollmentId: target.recordId, leadMinutes: action.leadMinutes };
  }
  if ((action.reminderType === "fee_due" || action.reminderType === "fee_overdue") && target.kind === "fee") {
    const repeat = action.reminderType === "fee_overdue" ? Math.min(43_200, Math.max(1_440, action.repeatIntervalMinutes)) : undefined;
    return { action: "save_reminder", type: action.reminderType, feeArrangementId: target.recordId, leadMinutes: Math.min(43_200, Math.max(0, action.leadMinutes)), repeatIntervalMinutes: repeat };
  }
  return { action: "none" };
}

function safeModelOutput(value: string): { suggestions: ModelSuggestion[] } {
  try {
    const parsed = JSON.parse(value) as { suggestions?: unknown };
    if (!Array.isArray(parsed.suggestions)) throw new Error();
    return { suggestions: parsed.suggestions as ModelSuggestion[] };
  } catch { throw new AIUnavailableError("OpenAI returned an invalid suggestion format.", 502); }
}
function boundedText(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

type OpenAIResponse = { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }> };
const suggestionSchema = {
  type: "object", additionalProperties: false, required: ["suggestions"], properties: {
    suggestions: { type: "array", maxItems: 3, items: { type: "object", additionalProperties: false, required: ["type", "subjectKey", "explanation", "evidence", "proposedAction"], properties: {
      type: { type: "string", enum: ["attendance_pattern", "punctuality_pattern", "fee_explanation", "reminder_timing"] },
      subjectKey: { type: "string" }, explanation: { type: "string" }, evidence: { type: "array", maxItems: 5, items: { type: "string" } },
      proposedAction: { type: "object", additionalProperties: false, required: ["action", "reminderType", "targetKey", "leadMinutes", "repeatIntervalMinutes"], properties: {
        action: { type: "string", enum: ["none", "save_reminder"] }, reminderType: { type: "string", enum: ["none", "class", "fee_due", "fee_overdue"] }, targetKey: { type: "string" }, leadMinutes: { type: "integer" }, repeatIntervalMinutes: { type: "integer" },
      } },
    } } },
  },
} as const;
