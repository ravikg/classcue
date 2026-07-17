import { and, eq, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { enrollments, feeArrangements, feeCharges, payments } from "@/db/schema";
import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { FeeValidationError, parseMoneyAmount } from "@/src/modules/fees/money";
import { newId } from "@/src/shared/ids";

export async function POST(request: Request, { params }: { params: Promise<{ chargeId: string }> }) {
  try {
    const context = await requireApiContext();
    const { chargeId } = await params;
    const body = (await request.json()) as { confirmedAmount?: string; reason?: string };
    const db = getDb();
    const [charge] = await db
      .select({
        id: feeCharges.id,
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
    const confirmedAmountMinor = parseMoneyAmount(body.confirmedAmount, charge.currency);
    const paidAmountMinor = Number(charge.paidAmountMinor);
    if (confirmedAmountMinor < paidAmountMinor) throw new FeeValidationError("Confirmed amount cannot be lower than payments already recorded.");
    if (confirmedAmountMinor === charge.confirmedAmountMinor) throw new FeeValidationError("Enter a different confirmed amount.");
    const reason = body.reason?.trim();
    if (!reason) throw new FeeValidationError("Explain this fee adjustment.");
    if (reason.length > 300) throw new FeeValidationError("Keep the reason under 300 characters.");

    await getD1().batch([
      getD1().prepare("INSERT INTO fee_adjustments (id, fee_charge_id, kind, amount_minor, reason) VALUES (?, ?, 'override', ?, ?)")
        .bind(newId("adj"), charge.id, confirmedAmountMinor - charge.confirmedAmountMinor, reason),
      getD1().prepare("UPDATE fee_charges SET confirmed_amount_minor = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(confirmedAmountMinor, paidAmountMinor >= confirmedAmountMinor ? "paid" : "due", charge.id),
    ]);
    return Response.json({ chargeId, confirmedAmountMinor, status: paidAmountMinor >= confirmedAmountMinor ? "paid" : "due" });
  } catch (error) {
    if (error instanceof FeeValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
