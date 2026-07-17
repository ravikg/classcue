import { and, eq, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { enrollments, feeArrangements, feeCharges, payments } from "@/db/schema";
import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { FeeValidationError, parseMoneyAmount } from "@/src/modules/fees/money";
import { newId } from "@/src/shared/ids";

const methods = new Set(["cash", "bank_transfer", "card", "online", "other"]);

export async function POST(request: Request, { params }: { params: Promise<{ chargeId: string }> }) {
  try {
    const context = await requireApiContext();
    const { chargeId } = await params;
    const body = (await request.json()) as { amount?: string; paidAt?: string; method?: string; reference?: string; note?: string };
    const db = getDb();
    const [charge] = await db
      .select({
        id: feeCharges.id,
        enrollmentId: feeArrangements.enrollmentId,
        model: feeArrangements.model,
        sessionsIncluded: feeArrangements.sessionsIncluded,
        confirmedAmountMinor: feeCharges.confirmedAmountMinor,
        currency: feeCharges.currency,
        paidAmountMinor: sql<number>`coalesce(sum(${payments.amountMinor}), 0)`,
      })
      .from(feeCharges)
      .innerJoin(feeArrangements, eq(feeCharges.feeArrangementId, feeArrangements.id))
      .innerJoin(enrollments, eq(feeArrangements.enrollmentId, enrollments.id))
      .leftJoin(payments, eq(feeCharges.id, payments.feeChargeId))
      .where(and(eq(feeCharges.id, chargeId), eq(enrollments.householdId, context.householdId)))
      .groupBy(feeCharges.id)
      .limit(1);
    if (!charge) throw new FeeValidationError("Fee not found.", 404);
    const amountMinor = parseMoneyAmount(body.amount, charge.currency);
    const paidAmountMinor = Number(charge.paidAmountMinor);
    const outstanding = charge.confirmedAmountMinor - paidAmountMinor;
    if (outstanding <= 0) throw new FeeValidationError("This fee is already fully paid.", 409);
    if (amountMinor > outstanding) throw new FeeValidationError("Payment cannot exceed the outstanding amount.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.paidAt ?? "")) throw new FeeValidationError("Choose a valid payment date.");
    if (!methods.has(body.method ?? "")) throw new FeeValidationError("Choose a valid payment method.");
    const reference = body.reference?.trim() || null;
    const note = body.note?.trim() || null;
    if (reference && reference.length > 120) throw new FeeValidationError("Keep the reference under 120 characters.");
    if (note && note.length > 500) throw new FeeValidationError("Keep the note under 500 characters.");
    const newPaidAmount = paidAmountMinor + amountMinor;
    const isPaid = newPaidAmount >= charge.confirmedAmountMinor;
    const d1 = getD1();
    const paymentId = newId("pay");
    const statements = [
      d1.prepare("INSERT INTO payments (id, fee_charge_id, amount_minor, currency, paid_at, method, reference, note, created_by_user_id) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ? <= (SELECT confirmed_amount_minor - COALESCE((SELECT SUM(amount_minor) FROM payments WHERE fee_charge_id = ?), 0) FROM fee_charges WHERE id = ?)")
        .bind(paymentId, charge.id, amountMinor, charge.currency, body.paidAt, body.method, reference, note, context.userId, amountMinor, charge.id, charge.id),
      d1.prepare("UPDATE fee_charges SET status = CASE WHEN COALESCE((SELECT SUM(amount_minor) FROM payments WHERE fee_charge_id = ?), 0) >= confirmed_amount_minor THEN 'paid' ELSE 'due' END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(charge.id, charge.id),
    ];
    if (isPaid && charge.model === "package" && charge.sessionsIncluded) {
      statements.push(d1.prepare("INSERT OR IGNORE INTO session_credit_entries (id, enrollment_id, fee_charge_id, entry_type, quantity, reason) SELECT ?, ?, ?, 'purchase', ?, 'Paid session package' WHERE (SELECT status FROM fee_charges WHERE id = ?) = 'paid'")
        .bind(newId("crd"), charge.enrollmentId, charge.id, charge.sessionsIncluded, charge.id));
    }
    const results = await d1.batch(statements);
    if (results[0].meta.changes !== 1) throw new FeeValidationError("The outstanding amount changed. Refresh and try again.", 409);
    const current = await d1.prepare("SELECT charges.status, COALESCE(SUM(payments.amount_minor), 0) AS paidAmountMinor FROM fee_charges charges LEFT JOIN payments ON payments.fee_charge_id = charges.id WHERE charges.id = ? GROUP BY charges.id")
      .bind(charge.id).first<{ status: string; paidAmountMinor: number }>();
    const actualPaidAmount = Number(current?.paidAmountMinor ?? newPaidAmount);
    return Response.json({ chargeId, paymentAmountMinor: amountMinor, paidAmountMinor: actualPaidAmount, outstandingAmountMinor: Math.max(0, charge.confirmedAmountMinor - actualPaidAmount), status: current?.status ?? (isPaid ? "paid" : "due") });
  } catch (error) {
    if (error instanceof FeeValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
