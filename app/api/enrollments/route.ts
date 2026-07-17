import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  children,
  contacts,
  enrollmentContacts,
  enrollments,
  providers,
  scheduleRules,
} from "@/db/schema";
import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { generateSessions } from "@/src/modules/scheduling/generate-sessions";
import { localDateInZone } from "@/src/shared/dates";
import { newId } from "@/src/shared/ids";

type EnrollmentRequest = {
  childId?: string;
  subject?: string;
  instituteName?: string;
  teacherName?: string;
  teacherPhone?: string;
  weekday?: number;
  startTime?: string;
  durationMinutes?: number;
  location?: string;
};

export async function POST(request: Request) {
  try {
    const context = await requireApiContext();
    const body = (await request.json()) as EnrollmentRequest;
    const subject = body.subject?.trim();
    const instituteName = body.instituteName?.trim();
    const weekday = Number(body.weekday);
    const durationMinutes = Number(body.durationMinutes);

    if (!body.childId || !subject || !instituteName) {
      return Response.json({ error: "Child, subject, and institute are required." }, { status: 400 });
    }
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return Response.json({ error: "Choose a valid class day." }, { status: 400 });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.startTime ?? "")) {
      return Response.json({ error: "Choose a valid start time." }, { status: 400 });
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 360) {
      return Response.json({ error: "Class duration must be between 15 minutes and 6 hours." }, { status: 400 });
    }

    const db = getDb();
    const [ownedChild] = await db
      .select({ id: children.id })
      .from(children)
      .where(and(eq(children.id, body.childId), eq(children.householdId, context.householdId)))
      .limit(1);
    if (!ownedChild) return Response.json({ error: "Child not found." }, { status: 404 });

    let [provider] = await db
      .select()
      .from(providers)
      .where(and(eq(providers.householdId, context.householdId), eq(providers.name, instituteName)))
      .limit(1);
    if (!provider) {
      const id = newId("prv");
      await db.insert(providers).values({ id, householdId: context.householdId, name: instituteName });
      [provider] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
    }

    const enrollmentId = newId("enr");
    const scheduleRuleId = newId("sch");
    const validFrom = localDateInZone(new Date(), context.timezone);
    await db.insert(enrollments).values({
      id: enrollmentId,
      householdId: context.householdId,
      childId: body.childId,
      providerId: provider.id,
      subject,
      displayName: subject,
      location: body.location?.trim() || null,
      timezone: context.timezone,
      startDate: validFrom,
    });
    await db.insert(scheduleRules).values({
      id: scheduleRuleId,
      enrollmentId,
      weekday,
      localStartTime: body.startTime!,
      durationMinutes,
      timezone: context.timezone,
      validFrom,
    });

    const teacherName = body.teacherName?.trim();
    if (teacherName) {
      const contactId = newId("con");
      await db.insert(contacts).values({
        id: contactId,
        householdId: context.householdId,
        providerId: provider.id,
        name: teacherName,
        phone: body.teacherPhone?.trim() || null,
      });
      await db.insert(enrollmentContacts).values({
        enrollmentId,
        contactId,
        role: "teacher",
        isPrimary: true,
      });
    }

    await generateSessions({
      enrollmentId,
      scheduleRuleId,
      weekday,
      localStartTime: body.startTime!,
      durationMinutes,
      timezone: context.timezone,
      validFrom,
    });

    return Response.json({ enrollmentId }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
