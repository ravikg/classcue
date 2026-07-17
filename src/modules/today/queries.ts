import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
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
  const rangeStart = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
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
    })
    .from(sessions)
    .innerJoin(enrollments, eq(sessions.enrollmentId, enrollments.id))
    .innerJoin(children, eq(enrollments.childId, children.id))
    .leftJoin(providers, eq(enrollments.providerId, providers.id))
    .where(
      and(
        eq(enrollments.householdId, context.householdId),
        gte(sessions.plannedStartAt, rangeStart),
        lte(sessions.plannedStartAt, rangeEnd),
      ),
    )
    .orderBy(asc(sessions.plannedStartAt));

  return {
    user: { displayName: context.displayName },
    household: {
      timezone: context.timezone,
      today: localDateInZone(now, context.timezone),
    },
    children: childRows.map((child) => ({
      ...child,
      enrollments: enrollmentRows.filter((row) => row.childId === child.id),
    })),
    upcomingSessions: sessionRows,
  };
}
