import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { ScheduleChangeError } from "@/src/modules/scheduling/change-session";
import { changeFutureRecurrence, type RecurrenceChangeInput } from "@/src/modules/scheduling/change-recurrence";

export async function POST(request: Request, { params }: { params: Promise<{ enrollmentId: string }> }) {
  try {
    const context = await requireApiContext();
    const { enrollmentId } = await params;
    return Response.json(await changeFutureRecurrence(context, enrollmentId, (await request.json()) as RecurrenceChangeInput));
  } catch (error) {
    if (error instanceof ScheduleChangeError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
