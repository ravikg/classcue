import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { changeSingleSession, ScheduleChangeError, type SessionChangeInput } from "@/src/modules/scheduling/change-session";
import { generateReminderJobs } from "@/src/modules/reminders/commands";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const context = await requireApiContext();
    const { sessionId } = await params;
    const result = await changeSingleSession(context, sessionId, (await request.json()) as SessionChangeInput);
    await generateReminderJobs(context);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ScheduleChangeError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
