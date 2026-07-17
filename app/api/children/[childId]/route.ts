import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { MaintenanceValidationError, updateChild } from "@/src/modules/household/maintenance";

export async function POST(request: Request, { params }: { params: Promise<{ childId: string }> }) {
  try {
    const context = await requireApiContext();
    const { childId } = await params;
    return Response.json(await updateChild(context, childId, await request.json()));
  } catch (error) {
    if (error instanceof MaintenanceValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
