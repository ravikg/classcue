import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  attendanceRecords,
  children,
  enrollments,
  providers,
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
      location: enrollments.location,
      localDate: sessions.localDate,
      plannedStartAt: sessions.plannedStartAt,
      plannedEndAt: sessions.plannedEndAt,
      timezone: sessions.timezone,
      status: sessions.status,
      attendanceStatus: attendanceRecords.attendanceStatus,
      punctuality: attendanceRecords.punctuality,
      minutesLate: attendanceRecords.minutesLate,
      attendanceNote: attendanceRecords.note,
    })
    .from(sessions)
    .innerJoin(enrollments, eq(sessions.enrollmentId, enrollments.id))
    .innerJoin(children, eq(enrollments.childId, children.id))
    .leftJoin(providers, eq(enrollments.providerId, providers.id))
    .leftJoin(attendanceRecords, eq(sessions.id, attendanceRecords.sessionId))
    .where(
      and(
        eq(enrollments.householdId, context.householdId),
        gte(sessions.plannedStartAt, rangeStart),
        lte(sessions.plannedStartAt, rangeEnd),
      ),
    )
    .orderBy(asc(sessions.plannedStartAt));

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

  const sessionResults = sessionRows.map((session) => ({
    ...session,
    canRecordAttendance:
      (session.status === "scheduled" || session.status === "makeup") &&
      new Date(session.plannedStartAt).getTime() <= now.getTime(),
  }));

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
    upcomingSessions: sessionResults,
  };
}
