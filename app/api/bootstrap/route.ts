import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { getClassCueSnapshot } from "@/src/modules/today/queries";
import { getFeesSnapshot } from "@/src/modules/fees/queries";
import { generateReminderJobs } from "@/src/modules/reminders/commands";
import { getReminderSnapshot } from "@/src/modules/reminders/queries";
import { ensureSuggestions, getSuggestions } from "@/src/modules/suggestions/engine";
import { getMaintenanceSnapshot } from "@/src/modules/household/maintenance";
import { env } from "cloudflare:workers";

export async function GET() {
  try {
    const context = await requireApiContext();
    await generateReminderJobs(context);
    await ensureSuggestions(context);
    const snapshot = await getClassCueSnapshot(context);
    const maintenance = await getMaintenanceSnapshot(context);
    return Response.json({
      ...snapshot,
      household: { ...snapshot.household, name: maintenance.household.name, timezone: maintenance.household.timezone },
      fees: await getFeesSnapshot(context, snapshot.household.today),
      reminders: await getReminderSnapshot(context),
      suggestions: await getSuggestions(context),
      ai: { configured: Boolean(env.OPENAI_API_KEY), model: env.OPENAI_MODEL ?? "gpt-5.6-sol" },
      contacts: maintenance.contacts,
      archivedEnrollments: maintenance.archivedEnrollments,
    });
  } catch (error) {
    return apiError(error);
  }
}
