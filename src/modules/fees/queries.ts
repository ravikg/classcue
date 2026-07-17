import { getD1 } from "@/db";
import type { HouseholdContext } from "@/src/modules/identity/context";

type ChargeRow = {
  id: string;
  arrangementId: string;
  enrollmentId: string;
  enrollmentName: string;
  childId: string;
  childName: string;
  childColor: string;
  providerName: string | null;
  model: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  suggestedAmountMinor: number;
  confirmedAmountMinor: number;
  currency: string;
  status: string;
  calculationSnapshot: string;
  paidAmountMinor: number;
};

type ArrangementRow = {
  id: string;
  enrollmentId: string;
  enrollmentName: string;
  childId: string;
  childName: string;
  model: string;
  currency: string;
  baseAmountMinor: number;
  sessionsIncluded: number | null;
  compensationPolicy: string;
  purchasedSessions: number;
  usedSessions: number;
  compensatedSessions: number;
  sessionBalance: number;
};

export async function getFeesSnapshot(context: HouseholdContext, today: string) {
  const d1 = getD1();
  const [chargeResult, arrangementResult, paymentResult, adjustmentResult] = await Promise.all([
    d1.prepare(
      "SELECT charges.id, charges.fee_arrangement_id AS arrangementId, arrangements.enrollment_id AS enrollmentId, enrollments.display_name AS enrollmentName, children.id AS childId, children.name AS childName, children.color AS childColor, providers.name AS providerName, arrangements.model, charges.period_start AS periodStart, charges.period_end AS periodEnd, charges.due_date AS dueDate, charges.suggested_amount_minor AS suggestedAmountMinor, charges.confirmed_amount_minor AS confirmedAmountMinor, charges.currency, charges.status, charges.calculation_snapshot AS calculationSnapshot, COALESCE(SUM(payments.amount_minor), 0) AS paidAmountMinor FROM fee_charges charges INNER JOIN fee_arrangements arrangements ON arrangements.id = charges.fee_arrangement_id INNER JOIN enrollments ON enrollments.id = arrangements.enrollment_id INNER JOIN children ON children.id = enrollments.child_id LEFT JOIN providers ON providers.id = enrollments.provider_id LEFT JOIN payments ON payments.fee_charge_id = charges.id WHERE enrollments.household_id = ? GROUP BY charges.id ORDER BY charges.due_date ASC, charges.created_at ASC",
    ).bind(context.householdId).all<ChargeRow>(),
    d1.prepare(
      "SELECT arrangements.id, arrangements.enrollment_id AS enrollmentId, enrollments.display_name AS enrollmentName, children.id AS childId, children.name AS childName, arrangements.model, arrangements.currency, arrangements.base_amount_minor AS baseAmountMinor, arrangements.sessions_included AS sessionsIncluded, arrangements.compensation_policy AS compensationPolicy, COALESCE(SUM(CASE WHEN credits.entry_type = 'purchase' THEN credits.quantity ELSE 0 END), 0) AS purchasedSessions, ABS(COALESCE(SUM(CASE WHEN credits.entry_type = 'use' THEN credits.quantity ELSE 0 END), 0)) AS usedSessions, COALESCE(SUM(CASE WHEN credits.entry_type IN ('restore', 'compensate') THEN credits.quantity ELSE 0 END), 0) AS compensatedSessions, COALESCE(SUM(credits.quantity), 0) AS sessionBalance FROM fee_arrangements arrangements INNER JOIN enrollments ON enrollments.id = arrangements.enrollment_id INNER JOIN children ON children.id = enrollments.child_id LEFT JOIN session_credit_entries credits ON credits.enrollment_id = enrollments.id WHERE enrollments.household_id = ? AND arrangements.status = 'active' GROUP BY arrangements.id ORDER BY children.created_at, enrollments.display_name",
    ).bind(context.householdId).all<ArrangementRow>(),
    d1.prepare(
      "SELECT payments.id, payments.fee_charge_id AS chargeId, payments.amount_minor AS amountMinor, payments.currency, payments.paid_at AS paidAt, payments.method, payments.reference, payments.note FROM payments INNER JOIN fee_charges charges ON charges.id = payments.fee_charge_id INNER JOIN fee_arrangements arrangements ON arrangements.id = charges.fee_arrangement_id INNER JOIN enrollments ON enrollments.id = arrangements.enrollment_id WHERE enrollments.household_id = ? ORDER BY payments.paid_at DESC, payments.created_at DESC",
    ).bind(context.householdId).all<{ id: string; chargeId: string; amountMinor: number; currency: string; paidAt: string; method: string; reference: string | null; note: string | null }>(),
    d1.prepare(
      "SELECT adjustments.id, adjustments.fee_charge_id AS chargeId, adjustments.amount_minor AS amountMinor, adjustments.reason, adjustments.created_at AS createdAt FROM fee_adjustments adjustments INNER JOIN fee_charges charges ON charges.id = adjustments.fee_charge_id INNER JOIN fee_arrangements arrangements ON arrangements.id = charges.fee_arrangement_id INNER JOIN enrollments ON enrollments.id = arrangements.enrollment_id WHERE enrollments.household_id = ? ORDER BY adjustments.created_at DESC",
    ).bind(context.householdId).all<{ id: string; chargeId: string; amountMinor: number; reason: string; createdAt: string }>(),
  ]);

  const charges = chargeResult.results.map((row) => {
    const paidAmountMinor = Number(row.paidAmountMinor);
    const outstandingAmountMinor = Math.max(0, row.confirmedAmountMinor - paidAmountMinor);
    return {
      ...row,
      paidAmountMinor,
      outstandingAmountMinor,
      displayStatus: row.status === "due" && row.dueDate < today ? "overdue" : row.status,
      calculation: parseSnapshot(row.calculationSnapshot),
      payments: paymentResult.results.filter((payment) => payment.chargeId === row.id),
      adjustments: adjustmentResult.results.filter((adjustment) => adjustment.chargeId === row.id),
    };
  });

  const currencies = new Set(charges.map((charge) => charge.currency));
  const totals = [...currencies].sort().map((currency) => ({
    currency,
    dueAmountMinor: charges.filter((charge) => charge.currency === currency && charge.status === "due").reduce((sum, charge) => sum + charge.outstandingAmountMinor, 0),
    paidAmountMinor: charges.filter((charge) => charge.currency === currency).reduce((sum, charge) => sum + charge.paidAmountMinor, 0),
  }));

  const childIds = new Set(charges.map((charge) => charge.childId));
  const childSummaries = [...childIds].flatMap((childId) => {
    const childCharges = charges.filter((charge) => charge.childId === childId);
    return [...new Set(childCharges.map((charge) => charge.currency))].map((currency) => ({
      childId,
      currency,
      dueAmountMinor: childCharges.filter((charge) => charge.currency === currency && charge.status === "due").reduce((sum, charge) => sum + charge.outstandingAmountMinor, 0),
      paidAmountMinor: childCharges.filter((charge) => charge.currency === currency).reduce((sum, charge) => sum + charge.paidAmountMinor, 0),
    }));
  });

  return {
    arrangements: arrangementResult.results.map((row) => ({ ...row, purchasedSessions: Number(row.purchasedSessions), usedSessions: Number(row.usedSessions), compensatedSessions: Number(row.compensatedSessions), sessionBalance: Number(row.sessionBalance) })),
    charges,
    dueCharges: charges.filter((charge) => charge.status === "due"),
    paidCharges: charges.filter((charge) => charge.status === "paid").sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    totals,
    childSummaries,
  };
}

function parseSnapshot(value: string) {
  try {
    return JSON.parse(value) as { basis?: string; explanation?: string; sessionCount?: number; sessionsIncluded?: number | null; previousPaidAmountMinor?: number | null };
  } catch {
    return { explanation: "Configured fee amount." };
  }
}
