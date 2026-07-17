import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  attendanceRecords,
  children,
  enrollments,
  providers,
  scheduleRules,
  sessions,
} from "@/db/schema";
import { localDateInZone } from "@/src/shared/dates";
import type { HouseholdContext } from "@/src/modules/identity/context";

export async function getClassCueSnapshot(context: HouseholdContext) {
  const db = getDb();
  const childRows = await db
    .select({ id: children.id, name: children.name, color: children.color })
    .from(children)
    .where(and(eq(children.householdId, context.householdId), isNull(children.archivedAt)))
    .orderBy(asc(children.createdAt));

  const enrollmentRows = await db
    .select({
      id: enrollments.id,
      childId: enrollments.childId,
      name: enrollments.displayName,
      subject: enrollments.subject,
      location: enrollments.location,
      onlineUrl: enrollments.onlineUrl,
      timezone: enrollments.timezone,
      version: enrollments.version,
      providerName: providers.name,
    })
    .from(enrollments)
    .leftJoin(providers, eq(enrollments.providerId, providers.id))
    .where(
      and(
        eq(enrollments.householdId, context.householdId),
        eq(enrollments.status, "active"),
        isNull(enrollments.archivedAt),
      ),
    )
    .orderBy(asc(enrollments.displayName));

  const now = new Date();
  const rangeStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const rangeEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const sessionRows = await db
    .select({
      id: sessions.id,
      childId: children.id,
      childName: children.name,
      childColor: children.color,
      enrollmentId: enrollments.id,
      enrollmentName: enrollments.displayName,
      subject: enrollments.subject,
      providerName: providers.name,
      location: sql<string | null>`coalesce(${sessions.locationOverride}, ${enrollments.location})`,
      onlineUrl: sql<string | null>`coalesce(${sessions.onlineUrlOverride}, ${enrollments.onlineUrl})`,
      localDate: sessions.localDate,
      plannedStartAt: sessions.plannedStartAt,
      plannedEndAt: sessions.plannedEndAt,
      timezone: sessions.timezone,
      status: sessions.status,
      source: sessions.source,
      reason: sessions.reason,
      compensationStatus: sessions.compensationStatus,
      scheduleWeekday: scheduleRules.weekday,
      scheduleStartTime: scheduleRules.localStartTime,
      scheduleDurationMinutes: scheduleRules.durationMinutes,
      attendanceStatus: attendanceRecords.attendanceStatus,
      punctuality: attendanceRecords.punctuality,
      minutesLate: attendanceRecords.minutesLate,
      attendanceNote: attendanceRecords.note,
      enrollmentStatus: enrollments.status,
    })
    .from(sessions)
    .innerJoin(enrollments, eq(sessions.enrollmentId, enrollments.id))
    .innerJoin(children, eq(enrollments.childId, children.id))
    .leftJoin(providers, eq(enrollments.providerId, providers.id))
    .leftJoin(scheduleRules, eq(sessions.scheduleRuleId, scheduleRules.id))
    .leftJoin(attendanceRecords, eq(sessions.id, attendanceRecords.sessionId))
    .where(
      and(
        eq(enrollments.householdId, context.householdId),
        gte(sessions.plannedStartAt, rangeStart),
        lte(sessions.plannedStartAt, rangeEnd),
      ),
    )
    .orderBy(asc(sessions.plannedStartAt));

  const linkResult = await getD1().prepare(
    "SELECT links.source_session_id AS sourceSessionId, links.target_session_id AS targetSessionId, links.link_type AS linkType, target.local_date AS targetLocalDate FROM session_links links INNER JOIN sessions source ON source.id = links.source_session_id INNER JOIN sessions target ON target.id = links.target_session_id INNER JOIN enrollments ON enrollments.id = source.enrollment_id WHERE enrollments.household_id = ? AND source.planned_start_at >= ? AND source.planned_start_at <= ?",
  ).bind(context.householdId, rangeStart, rangeEnd).all<{
    sourceSessionId: string;
    targetSessionId: string;
    linkType: string;
    targetLocalDate: string;
  }>();
  const links = linkResult.results;

  const compensationRows = await db
    .select({ childId: children.id })
    .from(sessions)
    .innerJoin(enrollments, eq(sessions.enrollmentId, enrollments.id))
    .innerJoin(children, eq(enrollments.childId, children.id))
    .where(and(
      eq(enrollments.householdId, context.householdId),
      eq(sessions.compensationStatus, "pending"),
    ));

  const attendanceRows = await db
    .select({
      sessionId: sessions.id,
      childId: children.id,
      enrollmentName: enrollments.displayName,
      providerName: providers.name,
      localDate: sessions.localDate,
      plannedStartAt: sessions.plannedStartAt,
      timezone: sessions.timezone,
      attendanceStatus: attendanceRecords.attendanceStatus,
      punctuality: attendanceRecords.punctuality,
      minutesLate: attendanceRecords.minutesLate,
      note: attendanceRecords.note,
    })
    .from(attendanceRecords)
    .innerJoin(sessions, eq(attendanceRecords.sessionId, sessions.id))
    .innerJoin(enrollments, eq(sessions.enrollmentId, enrollments.id))
    .innerJoin(children, eq(enrollments.childId, children.id))
    .leftJoin(providers, eq(enrollments.providerId, providers.id))
    .where(eq(enrollments.householdId, context.householdId))
    .orderBy(desc(sessions.plannedStartAt));

  const sessionResults = sessionRows.map((session) => {
    const link = links.find((candidate) => candidate.sourceSessionId === session.id);
    return {
      ...session,
      linkedSessionId: link?.targetSessionId ?? null,
      linkedSessionLocalDate: link?.targetLocalDate ?? null,
      linkType: link?.linkType ?? null,
      canRecordAttendance:
        (session.status === "scheduled" || session.status === "makeup") &&
        new Date(session.plannedStartAt).getTime() <= now.getTime(),
      canManageSchedule:
        !session.attendanceStatus &&
        (session.status === "scheduled" || session.status === "makeup" ||
          (session.status === "cancelled" && session.compensationStatus === "pending")),
      canChangeFutureRecurrence:
        session.source === "recurrence" &&
        session.status === "scheduled" &&
        !session.attendanceStatus &&
        new Date(session.plannedStartAt).getTime() > now.getTime(),
    };
  });

  return {
    user: { displayName: context.displayName },
    household: {
      timezone: context.timezone,
      today: localDateInZone(now, context.timezone),
    },
    children: childRows.map((child) => {
      const childAttendance = attendanceRows.filter((row) => row.childId === child.id);
      const attended = childAttendance.filter((row) => row.attendanceStatus === "attended").length;
      const absent = childAttendance.filter((row) => row.attendanceStatus === "absent").length;
      const lateRows = childAttendance.filter((row) => row.punctuality === "late");
      const totalLateMinutes = lateRows.reduce((sum, row) => sum + (row.minutesLate ?? 0), 0);

      return {
        ...child,
        enrollments: enrollmentRows.filter((row) => row.childId === child.id),
        attendanceSummary: {
          recorded: attended + absent,
          attended,
          absent,
          attendanceRate: attended + absent > 0 ? Math.round((attended / (attended + absent)) * 100) : null,
          lateArrivals: lateRows.length,
          averageMinutesLate: lateRows.length > 0 ? Math.round(totalLateMinutes / lateRows.length) : null,
        },
        recentAttendance: childAttendance.slice(0, 5),
        makeupBalance: compensationRows.filter((row) => row.childId === child.id).length,
        recentSessions: sessionResults
          .filter(
            (session) =>
              session.childId === child.id &&
              new Date(session.plannedStartAt).getTime() <= now.getTime(),
          )
          .reverse()
          .slice(0, 8),
      };
    }),
    upcomingSessions: sessionResults.filter((session) => session.enrollmentStatus === "active"),
  };
}
