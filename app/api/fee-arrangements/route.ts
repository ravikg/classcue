import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { createFeeArrangement, type ArrangementInput } from "@/src/modules/fees/commands";
import { FeeValidationError } from "@/src/modules/fees/money";

export async function POST(request: Request) {
  try {
    const context = await requireApiContext();
    return Response.json(await createFeeArrangement(context, (await request.json()) as ArrangementInput), { status: 201 });
  } catch (error) {
    if (error instanceof FeeValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
