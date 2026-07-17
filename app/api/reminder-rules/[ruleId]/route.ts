import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { ReminderValidationError, setReminderRuleEnabled } from "@/src/modules/reminders/commands";

export async function POST(request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  try {
    const context = await requireApiContext();
    const { ruleId } = await params;
    const body = (await request.json()) as { enabled?: boolean };
    return Response.json(await setReminderRuleEnabled(context, ruleId, body.enabled === true));
  } catch (error) {
    if (error instanceof ReminderValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
