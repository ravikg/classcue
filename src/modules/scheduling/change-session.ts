import { and, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { attendanceRecords, enrollments, sessions } from "@/db/schema";
import type { HouseholdContext } from "@/src/modules/identity/context";
import { zonedLocalToUtc } from "@/src/shared/dates";
import { newId } from "@/src/shared/ids";

export type SessionChangeInput = {
  changeType?: "cancel" | "reschedule" | "holiday";
  reason?: string;
  compensation?: "none" | "pending" | "makeup";
  replacementDate?: string;
  replacementTime?: string;
  replacementLocation?: string;
};

export class ScheduleChangeError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function changeSingleSession(
  context: HouseholdContext,
  sessionId: string,
  input: SessionChangeInput,
) {
  const db = getDb();
  const [session] = await db
    .select({
      id: sessions.id,
      enrollmentId: sessions.enrollmentId,
      plannedStartAt: sessions.plannedStartAt,
      plannedEndAt: sessions.plannedEndAt,
      timezone: sessions.timezone,
      status: sessions.status,
      compensationStatus: sessions.compensationStatus,
      attendanceSessionId: attendanceRecords.sessionId,
    })
    .from(sessions)
    .innerJoin(enrollments, eq(sessions.enrollmentId, enrollments.id))
    .leftJoin(attendanceRecords, eq(sessions.id, attendanceRecords.sessionId))
    .where(and(eq(sessions.id, sessionId), eq(enrollments.householdId, context.householdId)))
    .limit(1);

  if (!session) throw new ScheduleChangeError("Session not found.", 404);
  if (session.attendanceSessionId) {
    throw new ScheduleChangeError("Remove the attendance record before changing this session.", 409);
  }
  const changeType = input.changeType;
  if (!changeType || !["cancel", "reschedule", "holiday"].includes(changeType)) {
    throw new ScheduleChangeError("Choose a valid session change.");
  }
  const reason = input.reason?.trim();
  if (!reason) throw new ScheduleChangeError("Add a short reason for the change.");
  if (reason.length > 300) throw new ScheduleChangeError("Keep the reason under 300 characters.");

  const resolvingPendingMakeup =
    session.status === "cancelled" &&
    session.compensationStatus === "pending" &&
    changeType === "cancel" &&
    input.compensation === "makeup";
  if (session.status !== "scheduled" && session.status !== "makeup" && !resolvingPendingMakeup) {
    throw new ScheduleChangeError("This session has already been changed.", 409);
  }

  const createsReplacement = changeType === "reschedule" ||
    (changeType === "cancel" && input.compensation === "makeup");
  let replacement: { id: string; localDate: string; start: string; end: string; location: string | null } | null = null;

  if (createsReplacement) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.replacementDate ?? "") ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.replacementTime ?? "")) {
      throw new ScheduleChangeError("Choose a valid replacement date and time.");
    }
    const start = zonedLocalToUtc(input.replacementDate!, input.replacementTime!, session.timezone);
    if (start.getTime() <= Date.now()) {
      throw new ScheduleChangeError("The replacement session must be in the future.");
    }
    const duration = Math.max(
      15 * 60_000,
      new Date(session.plannedEndAt).getTime() - new Date(session.plannedStartAt).getTime(),
    );
    replacement = {
      id: newId("ses"),
      localDate: input.replacementDate!,
      start: start.toISOString(),
      end: new Date(start.getTime() + duration).toISOString(),
      location: input.replacementLocation?.trim() || null,
    };
  }

  const originalStatus = changeType === "cancel" ? "cancelled" : changeType === "holiday" ? "holiday" : "rescheduled";
  const compensationStatus = changeType === "cancel"
    ? input.compensation === "makeup" ? "linked" : input.compensation === "pending" ? "pending" : "none"
    : null;
  const d1 = getD1();
  const statements = [
    d1.prepare(
      "UPDATE sessions SET status = ?, reason = ?, compensation_status = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(originalStatus, reason, compensationStatus, session.id),
  ];

  if (replacement) {
    statements.push(
      d1.prepare(
        "INSERT INTO sessions (id, enrollment_id, local_date, planned_start_at, planned_end_at, timezone, location_override, status, source, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)",
      ).bind(
        replacement.id,
        session.enrollmentId,
        replacement.localDate,
        replacement.start,
        replacement.end,
        session.timezone,
        replacement.location,
        changeType === "cancel" ? "makeup" : "scheduled",
        reason,
      ),
      d1.prepare(
        "INSERT INTO session_links (id, source_session_id, target_session_id, link_type) VALUES (?, ?, ?, ?)",
      ).bind(newId("lnk"), session.id, replacement.id, changeType === "cancel" ? "makeup" : "reschedule"),
    );
  }

  await d1.batch(statements);
  return { sessionId, status: originalStatus, compensationStatus, replacementSessionId: replacement?.id ?? null };
}
