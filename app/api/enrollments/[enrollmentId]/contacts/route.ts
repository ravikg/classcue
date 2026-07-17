import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { linkEnrollmentContact, MaintenanceValidationError, unlinkEnrollmentContact } from "@/src/modules/household/maintenance";

export async function POST(request: Request, { params }: { params: Promise<{ enrollmentId: string }> }) {
  try {
    const context = await requireApiContext();
    const { enrollmentId } = await params;
    const body = await request.json() as { action?: string; contactId?: string; role?: string; isPrimary?: boolean };
    if (body.action === "unlink") return Response.json(await unlinkEnrollmentContact(context, enrollmentId, body));
    return Response.json(await linkEnrollmentContact(context, enrollmentId, body));
  } catch (error) {
    if (error instanceof MaintenanceValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
