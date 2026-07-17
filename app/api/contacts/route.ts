import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { createContact, MaintenanceValidationError } from "@/src/modules/household/maintenance";

export async function POST(request: Request) {
  try {
    const context = await requireApiContext();
    return Response.json(await createContact(context, await request.json()), { status: 201 });
  } catch (error) {
    if (error instanceof MaintenanceValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
