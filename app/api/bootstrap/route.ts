import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { getClassCueSnapshot } from "@/src/modules/today/queries";
import { getFeesSnapshot } from "@/src/modules/fees/queries";

export async function GET() {
  try {
    const context = await requireApiContext();
    const snapshot = await getClassCueSnapshot(context);
    return Response.json({
      ...snapshot,
      fees: await getFeesSnapshot(context, snapshot.household.today),
    });
  } catch (error) {
    return apiError(error);
  }
}
