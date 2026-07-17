import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { generateReminderJobs } from "@/src/modules/reminders/commands";
import { getReminderSnapshot } from "@/src/modules/reminders/queries";

export async function GET() {
  try {
    const context = await requireApiContext();
    await generateReminderJobs(context);
    const snapshot = await getReminderSnapshot(context);
    return Response.json({ jobs: snapshot.dueJobs });
  } catch (error) {
    return apiError(error);
  }
}
