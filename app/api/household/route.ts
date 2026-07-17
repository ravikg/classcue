import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { MaintenanceValidationError, updateHousehold } from "@/src/modules/household/maintenance";

export async function POST(request: Request) {
  try {
    const context = await requireApiContext();
    return Response.json(await updateHousehold(context, await request.json()));
  } catch (error) {
    if (error instanceof MaintenanceValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
