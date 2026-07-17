import { and, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { enrollments, feeArrangements, feeCharges } from "@/db/schema";
import type { HouseholdContext } from "@/src/modules/identity/context";
import { newId } from "@/src/shared/ids";
import { FeeValidationError, normalizeCurrency, parseMoneyAmount } from "./money";

const models = new Set(["monthly", "term", "package", "per_session"]);
const compensationPolicies = new Set(["none", "makeup", "credit", "manual"]);

export type ArrangementInput = {
  enrollmentId?: string;
  model?: string;
  currency?: string;
  amount?: string;
  sessionsIncluded?: number | string | null;
  compensationPolicy?: string;
  periodStart?: string;
  periodEnd?: string;
  dueDate?: string;
  confirmedAmount?: string | null;
  adjustmentReason?: string | null;
};

export type ChargeInput = {
  periodStart?: string;
  periodEnd?: string;
  dueDate?: string;
};

export async function createFeeArrangement(context: HouseholdContext, input: ArrangementInput) {
  const model = input.model ?? "";
  if (!models.has(model)) throw new FeeValidationError("Choose a valid fee model.");
  const currency = normalizeCurrency(input.currency);
  const baseAmountMinor = parseMoneyAmount(input.amount, currency);
  const sessionsIncluded = input.sessionsIncluded === "" || input.sessionsIncluded == null
    ? null
    : Number(input.sessionsIncluded);
  if (sessionsIncluded !== null && (!Number.isInteger(sessionsIncluded) || sessionsIncluded < 1 || sessionsIncluded > 1000)) {
    throw new FeeValidationError("Sessions included must be between 1 and 1,000.");
  }
  if ((model === "monthly" || model === "package") && sessionsIncluded === null) {
    throw new FeeValidationError("Add the expected or purchased session count.");
  }
  const compensationPolicy = compensationPolicies.has(input.compensationPolicy ?? "")
    ? input.compensationPolicy!
    : "manual";
  validatePeriod(input.periodStart, input.periodEnd, input.dueDate);

  const db = getDb();
  const [enrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.id, input.enrollmentId ?? ""), eq(enrollments.householdId, context.householdId)))
    .limit(1);
  if (!enrollment) throw new FeeValidationError("Class not found.", 404);

  const active = await db
    .select({ id: feeArrangements.id })
    .from(feeArrangements)
    .where(and(eq(feeArrangements.enrollmentId, enrollment.id), eq(feeArrangements.status, "active")))
    .limit(1);
  if (active.length > 0) throw new FeeValidationError("This class already has an active fee arrangement.", 409);

  const calculation = await calculateSuggestion({
    enrollmentId: enrollment.id,
    model,
    baseAmountMinor,
    sessionsIncluded,
    periodStart: input.periodStart!,
    periodEnd: input.periodEnd!,
    previousPaidAmountMinor: null,
  });
  const confirmedAmountMinor = input.confirmedAmount
    ? parseMoneyAmount(input.confirmedAmount, currency)
    : calculation.suggestedAmountMinor;
  const adjustmentReason = input.adjustmentReason?.trim() || null;
  if (confirmedAmountMinor !== calculation.suggestedAmountMinor && !adjustmentReason) {
    throw new FeeValidationError("Explain why the confirmed amount differs from the suggestion.");
  }

  const arrangementId = newId("fee");
  const chargeId = newId("chg");
  const d1 = getD1();
  const statements = [
    d1.prepare("INSERT INTO fee_arrangements (id, enrollment_id, model, currency, base_amount_minor, sessions_included, billing_cadence, valid_from, compensation_policy, configuration_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(arrangementId, enrollment.id, model, currency, baseAmountMinor, sessionsIncluded, cadenceFor(model), input.periodStart, compensationPolicy, JSON.stringify({ currencyMinorUnits: currencyMinorUnitsForSnapshot(currency) })),
    d1.prepare("INSERT INTO fee_charges (id, fee_arrangement_id, period_start, period_end, due_date, suggested_amount_minor, confirmed_amount_minor, currency, calculation_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(chargeId, arrangementId, input.periodStart, input.periodEnd, input.dueDate, calculation.suggestedAmountMinor, confirmedAmountMinor, currency, JSON.stringify(calculation.snapshot)),
  ];
  if (adjustmentReason) {
    statements.push(d1.prepare("INSERT INTO fee_adjustments (id, fee_charge_id, kind, amount_minor, reason) VALUES (?, ?, 'override', ?, ?)")
      .bind(newId("adj"), chargeId, confirmedAmountMinor - calculation.suggestedAmountMinor, adjustmentReason));
  }
  await d1.batch(statements);
  return { arrangementId, chargeId, suggestedAmountMinor: calculation.suggestedAmountMinor, confirmedAmountMinor };
}

export async function createFeeCharge(context: HouseholdContext, arrangementId: string, input: ChargeInput) {
  validatePeriod(input.periodStart, input.periodEnd, input.dueDate);
  const db = getDb();
  const [arrangement] = await db
    .select({
      id: feeArrangements.id,
      enrollmentId: feeArrangements.enrollmentId,
      model: feeArrangements.model,
      currency: feeArrangements.currency,
      baseAmountMinor: feeArrangements.baseAmountMinor,
      sessionsIncluded: feeArrangements.sessionsIncluded,
      status: feeArrangements.status,
    })
    .from(feeArrangements)
    .innerJoin(enrollments, eq(feeArrangements.enrollmentId, enrollments.id))
    .where(and(eq(feeArrangements.id, arrangementId), eq(enrollments.householdId, context.householdId)))
    .limit(1);
  if (!arrangement) throw new FeeValidationError("Fee arrangement not found.", 404);
  if (arrangement.status !== "active") throw new FeeValidationError("This fee arrangement is no longer active.", 409);

  const previous = await getD1().prepare(
    "SELECT confirmed_amount_minor AS confirmedAmountMinor FROM fee_charges WHERE fee_arrangement_id = ? AND status = 'paid' ORDER BY period_end DESC LIMIT 1",
  ).bind(arrangement.id).first<{ confirmedAmountMinor: number }>();
  const calculation = await calculateSuggestion({
    enrollmentId: arrangement.enrollmentId,
    model: arrangement.model,
    baseAmountMinor: arrangement.baseAmountMinor,
    sessionsIncluded: arrangement.sessionsIncluded,
    periodStart: input.periodStart!,
    periodEnd: input.periodEnd!,
    previousPaidAmountMinor: previous?.confirmedAmountMinor ?? null,
  });
  const chargeId = newId("chg");
  try {
    await db.insert(feeCharges).values({
      id: chargeId,
      feeArrangementId: arrangement.id,
      periodStart: input.periodStart!,
      periodEnd: input.periodEnd!,
      dueDate: input.dueDate!,
      suggestedAmountMinor: calculation.suggestedAmountMinor,
      confirmedAmountMinor: calculation.suggestedAmountMinor,
      currency: arrangement.currency,
      calculationSnapshot: JSON.stringify(calculation.snapshot),
    });
  } catch {
    throw new FeeValidationError("A fee already exists for this period.", 409);
  }
  return { chargeId, suggestedAmountMinor: calculation.suggestedAmountMinor };
}

async function calculateSuggestion(input: {
  enrollmentId: string;
  model: string;
  baseAmountMinor: number;
  sessionsIncluded: number | null;
  periodStart: string;
  periodEnd: string;
  previousPaidAmountMinor: number | null;
}) {
  const countRow = await getD1().prepare(
    "SELECT COUNT(*) AS count FROM sessions WHERE enrollment_id = ? AND local_date >= ? AND local_date <= ? AND status IN ('scheduled', 'makeup')",
  ).bind(input.enrollmentId, input.periodStart, input.periodEnd).first<{ count: number }>();
  const sessionCount = Number(countRow?.count ?? 0);
  let suggestedAmountMinor = input.baseAmountMinor;
  let basis = "configured amount";
  if (input.model === "per_session") {
    if (sessionCount === 0) {
      throw new FeeValidationError("No billable sessions fall inside this fee period.");
    }
    suggestedAmountMinor = input.baseAmountMinor * sessionCount;
    basis = `${sessionCount} billable ${sessionCount === 1 ? "session" : "sessions"} × the per-session rate`;
  } else if ((input.model === "monthly" || input.model === "term") && input.previousPaidAmountMinor) {
    suggestedAmountMinor = input.previousPaidAmountMinor;
    basis = "previous paid amount";
  } else if (input.model === "monthly") {
    basis = `configured monthly amount for ${input.sessionsIncluded ?? sessionCount} expected sessions`;
  } else if (input.model === "term") {
    basis = "configured term amount";
  } else if (input.model === "package") {
    basis = `${input.sessionsIncluded ?? 0}-session package`;
  }
  return {
    suggestedAmountMinor,
    snapshot: {
      model: input.model,
      basis,
      baseAmountMinor: input.baseAmountMinor,
      sessionCount,
      sessionsIncluded: input.sessionsIncluded,
      previousPaidAmountMinor: input.previousPaidAmountMinor,
      explanation: `Suggested from ${basis}.`,
    },
  };
}

function validatePeriod(periodStart?: string, periodEnd?: string, dueDate?: string) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(periodStart ?? "") || !datePattern.test(periodEnd ?? "") || !datePattern.test(dueDate ?? "")) {
    throw new FeeValidationError("Add valid period and due dates.");
  }
  if (periodStart! > periodEnd!) throw new FeeValidationError("The fee period must end after it starts.");
}

function cadenceFor(model: string) {
  return model === "monthly" ? "monthly" : model === "per_session" ? "per_period" : "one_off";
}

function currencyMinorUnitsForSnapshot(currency: string) {
  return ["BHD", "JOD", "KWD", "OMR", "TND"].includes(currency) ? 3 : ["JPY", "KRW", "VND"].includes(currency) ? 0 : 2;
}
