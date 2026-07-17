import { getDb } from "@/db";
import { children } from "@/db/schema";
import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { newId } from "@/src/shared/ids";

const allowedColors = new Set(["blue", "coral", "green", "gold"]);

export async function POST(request: Request) {
  try {
    const context = await requireApiContext();
    const body = (await request.json()) as { name?: string; color?: string };
    const name = body.name?.trim();
    if (!name || name.length > 80) {
      return Response.json({ error: "Enter a child name." }, { status: 400 });
    }

    const child = {
      id: newId("chd"),
      householdId: context.householdId,
      name,
      color: allowedColors.has(body.color ?? "") ? body.color! : "blue",
    };
    await getDb().insert(children).values(child);
    return Response.json({ child }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
