import { and, eq, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { attendanceRecords, enrollments, sessions } from "@/db/schema";
import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { newId } from "@/src/shared/ids";

type AttendanceRequest = {
  attendanceStatus?: string;
  punctuality?: string | null;
  minutesLate?: number | null;
  note?: string | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const context = await requireApiContext();
    const { sessionId } = await params;
    const body = (await request.json()) as AttendanceRequest;
    const db = getDb();

    const [session] = await db
      .select({
        id: sessions.id,
        enrollmentId: sessions.enrollmentId,
        status: sessions.status,
        plannedStartAt: sessions.plannedStartAt,
      })
      .from(sessions)
      .innerJoin(enrollments, eq(sessions.enrollmentId, enrollments.id))
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(enrollments.householdId, context.householdId),
        ),
      )
      .limit(1);

    if (!session) {
      return Response.json({ error: "Session not found." }, { status: 404 });
    }
    if (session.status !== "scheduled" && session.status !== "makeup") {
      return Response.json(
        { error: "Attendance cannot be recorded for this session status." },
        { status: 409 },
      );
    }
    if (new Date(session.plannedStartAt).getTime() > Date.now()) {
      return Response.json(
        { error: "Attendance can be recorded once the class has started." },
        { status: 409 },
      );
    }

    const attendanceStatus = body.attendanceStatus;
    if (attendanceStatus !== "attended" && attendanceStatus !== "absent") {
      return Response.json({ error: "Choose attended or absent." }, { status: 400 });
    }

    let punctuality: "on_time" | "late" | null = null;
    let minutesLate: number | null = null;
    if (attendanceStatus === "attended") {
      punctuality = body.punctuality === "late" ? "late" : "on_time";
      if (punctuality === "late") {
        minutesLate = Number(body.minutesLate);
        if (!Number.isInteger(minutesLate) || minutesLate < 1 || minutesLate > 360) {
          return Response.json(
            { error: "Minutes late must be between 1 and 360." },
            { status: 400 },
          );
        }
      }
    }

    const note = body.note?.trim() || null;
    if (note && note.length > 500) {
      return Response.json({ error: "Keep the note under 500 characters." }, { status: 400 });
    }

    await db
      .insert(attendanceRecords)
      .values({
        sessionId,
        attendanceStatus,
        punctuality,
        minutesLate,
        note,
        recordedByUserId: context.userId,
      })
      .onConflictDoUpdate({
        target: attendanceRecords.sessionId,
        set: {
          attendanceStatus,
          punctuality,
          minutesLate,
          note,
          recordedByUserId: context.userId,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });

    await getD1().prepare(
      "INSERT OR IGNORE INTO session_credit_entries (id, enrollment_id, session_id, entry_type, quantity, reason) SELECT ?, ?, ?, 'use', -1, 'Session recorded as completed' WHERE EXISTS (SELECT 1 FROM fee_arrangements WHERE enrollment_id = ? AND model = 'package' AND status = 'active') AND NOT EXISTS (SELECT 1 FROM session_links WHERE target_session_id = ? AND link_type = 'makeup')",
    ).bind(newId("crd"), session.enrollmentId, sessionId, session.enrollmentId, sessionId).run();

    return Response.json({
      attendance: { sessionId, attendanceStatus, punctuality, minutesLate, note },
    });
  } catch (error) {
    return apiError(error);
  }
}
