import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { ReminderValidationError, saveReminderRule, type ReminderRuleInput } from "@/src/modules/reminders/commands";

export async function POST(request: Request) {
  try {
    const context = await requireApiContext();
    return Response.json(await saveReminderRule(context, (await request.json()) as ReminderRuleInput), { status: 201 });
  } catch (error) {
    if (error instanceof ReminderValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
