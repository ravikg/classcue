import { and, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { attendanceRecords, enrollments, sessions } from "@/db/schema";
import type { HouseholdContext } from "@/src/modules/identity/context";
import { addDays } from "@/src/shared/dates";
import { newId } from "@/src/shared/ids";
import { generateSessions } from "./generate-sessions";
import { ScheduleChangeError } from "./change-session";

export type RecurrenceChangeInput = {
  effectiveSessionId?: string;
  weekday?: number;
  startTime?: string;
  durationMinutes?: number;
  location?: string;
};

export async function changeFutureRecurrence(
  context: HouseholdContext,
  enrollmentId: string,
  input: RecurrenceChangeInput,
) {
  const weekday = Number(input.weekday);
  const durationMinutes = Number(input.durationMinutes);
  if (!input.effectiveSessionId) throw new ScheduleChangeError("Choose the first session to change.");
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new ScheduleChangeError("Choose a valid weekday.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime ?? "")) throw new ScheduleChangeError("Choose a valid start time.");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 360) {
    throw new ScheduleChangeError("Duration must be between 15 minutes and 6 hours.");
  }

  const db = getDb();
  const [session] = await db
    .select({
      id: sessions.id,
      scheduleRuleId: sessions.scheduleRuleId,
      localDate: sessions.localDate,
      plannedStartAt: sessions.plannedStartAt,
      status: sessions.status,
      source: sessions.source,
      timezone: sessions.timezone,
      attendanceSessionId: attendanceRecords.sessionId,
    })
    .from(sessions)
    .innerJoin(enrollments, eq(sessions.enrollmentId, enrollments.id))
    .leftJoin(attendanceRecords, eq(sessions.id, attendanceRecords.sessionId))
    .where(and(
      eq(sessions.id, input.effectiveSessionId),
      eq(sessions.enrollmentId, enrollmentId),
      eq(enrollments.householdId, context.householdId),
    ))
    .limit(1);

  if (!session) throw new ScheduleChangeError("Session or class not found.", 404);
  if (!session.scheduleRuleId || session.source !== "recurrence" || session.status !== "scheduled") {
    throw new ScheduleChangeError("Future changes must begin with a scheduled recurring session.", 409);
  }
  if (session.attendanceSessionId || new Date(session.plannedStartAt).getTime() <= Date.now()) {
    throw new ScheduleChangeError("Choose a future session without attendance.", 409);
  }

  const newRuleId = newId("sch");
  const location = input.location?.trim() || null;
  const d1 = getD1();
  const results = await d1.batch([
    d1.prepare("UPDATE schedule_rules SET valid_to = ?, superseded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND superseded_at IS NULL")
      .bind(addDays(session.localDate, -1), session.scheduleRuleId),
    d1.prepare("INSERT INTO schedule_rules (id, enrollment_id, weekday, local_start_time, duration_minutes, timezone, valid_from) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(newRuleId, enrollmentId, weekday, input.startTime, durationMinutes, session.timezone, session.localDate),
    d1.prepare("DELETE FROM sessions WHERE enrollment_id = ? AND planned_start_at >= ? AND source = 'recurrence' AND status = 'scheduled' AND NOT EXISTS (SELECT 1 FROM attendance_records WHERE attendance_records.session_id = sessions.id)")
      .bind(enrollmentId, session.plannedStartAt),
    d1.prepare("UPDATE enrollments SET location = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(location, enrollmentId),
  ]);

  const generated = await generateSessions({
    enrollmentId,
    scheduleRuleId: newRuleId,
    weekday,
    localStartTime: input.startTime!,
    durationMinutes,
    timezone: session.timezone,
    validFrom: session.localDate,
  });
  return { enrollmentId, effectiveDate: session.localDate, deletedFutureSessions: results[2].meta.changes, generatedSessions: generated };
}
