import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { getClassCueSnapshot } from "@/src/modules/today/queries";

export async function GET() {
  try {
    const context = await requireApiContext();
    return Response.json(await getClassCueSnapshot(context));
  } catch (error) {
    return apiError(error);
  }
}
