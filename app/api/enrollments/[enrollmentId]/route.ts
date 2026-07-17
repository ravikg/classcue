import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { archiveEnrollment, MaintenanceValidationError, restoreEnrollment, updateEnrollment } from "@/src/modules/household/maintenance";
import { generateReminderJobs } from "@/src/modules/reminders/commands";

export async function POST(request: Request, { params }: { params: Promise<{ enrollmentId: string }> }) {
  try {
    const context = await requireApiContext();
    const { enrollmentId } = await params;
    const body = await request.json() as { action?: string; subject?: string; displayName?: string; providerName?: string; location?: string; onlineUrl?: string; version?: number };
    if (body.action === "archive") { const result = await archiveEnrollment(context, enrollmentId); await generateReminderJobs(context); return Response.json(result); }
    if (body.action === "restore") { const result = await restoreEnrollment(context, enrollmentId); await generateReminderJobs(context); return Response.json(result); }
    return Response.json(await updateEnrollment(context, enrollmentId, body));
  } catch (error) {
    if (error instanceof MaintenanceValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
