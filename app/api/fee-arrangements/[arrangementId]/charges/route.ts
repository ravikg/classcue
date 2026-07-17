import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { createFeeCharge, type ChargeInput } from "@/src/modules/fees/commands";
import { FeeValidationError } from "@/src/modules/fees/money";

export async function POST(request: Request, { params }: { params: Promise<{ arrangementId: string }> }) {
  try {
    const context = await requireApiContext();
    const { arrangementId } = await params;
    return Response.json(await createFeeCharge(context, arrangementId, (await request.json()) as ChargeInput), { status: 201 });
  } catch (error) {
    if (error instanceof FeeValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
