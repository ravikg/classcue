import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { createFeeArrangement, type ArrangementInput } from "@/src/modules/fees/commands";
import { FeeValidationError } from "@/src/modules/fees/money";
import { generateReminderJobs } from "@/src/modules/reminders/commands";

export async function POST(request: Request) {
  try {
    const context = await requireApiContext();
    const result = await createFeeArrangement(context, (await request.json()) as ArrangementInput);
    await generateReminderJobs(context);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof FeeValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
