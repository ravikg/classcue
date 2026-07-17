import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { archiveEnrollment, MaintenanceValidationError, restoreEnrollment, updateEnrollment } from "@/src/modules/household/maintenance";

export async function POST(request: Request, { params }: { params: Promise<{ enrollmentId: string }> }) {
  try {
    const context = await requireApiContext();
    const { enrollmentId } = await params;
    const body = await request.json() as { action?: string; subject?: string; displayName?: string; providerName?: string; location?: string; onlineUrl?: string; version?: number };
    if (body.action === "archive") return Response.json(await archiveEnrollment(context, enrollmentId));
    if (body.action === "restore") return Response.json(await restoreEnrollment(context, enrollmentId));
    return Response.json(await updateEnrollment(context, enrollmentId, body));
  } catch (error) {
    if (error instanceof MaintenanceValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
