import { getD1 } from "@/db";
import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { ReminderValidationError } from "@/src/modules/reminders/commands";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const context = await requireApiContext();
    const { jobId } = await params;
    const body = (await request.json()) as { status?: "delivered" | "dismissed" };
    if (body.status !== "delivered" && body.status !== "dismissed") throw new ReminderValidationError("Choose a valid reminder action.");
    const result = await getD1().prepare(
      "UPDATE reminder_jobs SET status = ?, attempts = attempts + 1, sent_at = CASE WHEN ? = 'delivered' THEN CURRENT_TIMESTAMP ELSE sent_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending' AND rule_id IN (SELECT id FROM reminder_rules WHERE household_id = ?)",
    ).bind(body.status, body.status, jobId, context.householdId).run();
    if (result.meta.changes !== 1) throw new ReminderValidationError("Reminder is no longer pending.", 409);
    return Response.json({ jobId, status: body.status });
  } catch (error) {
    if (error instanceof ReminderValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
