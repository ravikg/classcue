import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { ReminderValidationError } from "@/src/modules/reminders/commands";
import { reviewSuggestion } from "@/src/modules/suggestions/engine";

export async function POST(request: Request, { params }: { params: Promise<{ suggestionId: string }> }) {
  try {
    const context = await requireApiContext();
    const { suggestionId } = await params;
    const body = (await request.json()) as { decision?: "accept" | "dismiss" };
    if (body.decision !== "accept" && body.decision !== "dismiss") throw new ReminderValidationError("Choose accept or dismiss.");
    return Response.json(await reviewSuggestion(context, suggestionId, body.decision));
  } catch (error) {
    if (error instanceof ReminderValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
