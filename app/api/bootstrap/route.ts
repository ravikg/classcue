import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { getClassCueSnapshot } from "@/src/modules/today/queries";
import { getFeesSnapshot } from "@/src/modules/fees/queries";
import { generateReminderJobs } from "@/src/modules/reminders/commands";
import { getReminderSnapshot } from "@/src/modules/reminders/queries";
import { ensureSuggestions, getSuggestions } from "@/src/modules/suggestions/engine";

export async function GET() {
  try {
    const context = await requireApiContext();
    await generateReminderJobs(context);
    await ensureSuggestions(context);
    const snapshot = await getClassCueSnapshot(context);
    return Response.json({
      ...snapshot,
      fees: await getFeesSnapshot(context, snapshot.household.today),
      reminders: await getReminderSnapshot(context),
      suggestions: await getSuggestions(context),
    });
  } catch (error) {
    return apiError(error);
  }
}
