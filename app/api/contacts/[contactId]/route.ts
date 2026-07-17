import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { archiveContact, MaintenanceValidationError, updateContact } from "@/src/modules/household/maintenance";

export async function POST(request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  try {
    const context = await requireApiContext();
    const { contactId } = await params;
    const body = await request.json() as { action?: string; name?: string; phone?: string; email?: string; notes?: string; providerName?: string };
    if (body.action === "archive") return Response.json(await archiveContact(context, contactId));
    return Response.json(await updateContact(context, contactId, body));
  } catch (error) {
    if (error instanceof MaintenanceValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
