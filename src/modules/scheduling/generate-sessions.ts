import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import { addDays, weekdayOf, zonedLocalToUtc } from "@/src/shared/dates";
import { newId } from "@/src/shared/ids";

type GenerateSessionsInput = {
  enrollmentId: string;
  scheduleRuleId: string;
  weekday: number;
  localStartTime: string;
  durationMinutes: number;
  timezone: string;
  validFrom: string;
  horizonDays?: number;
};

export async function generateSessions(input: GenerateSessionsInput) {
  const db = getDb();
  const horizonDays = input.horizonDays ?? 90;
  const values = [];

  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const localDate = addDays(input.validFrom, offset);
    if (weekdayOf(localDate) !== input.weekday) continue;

    const start = zonedLocalToUtc(localDate, input.localStartTime, input.timezone);
    const end = new Date(start.getTime() + input.durationMinutes * 60_000);
    values.push({
      id: newId("ses"),
      enrollmentId: input.enrollmentId,
      scheduleRuleId: input.scheduleRuleId,
      localDate,
      plannedStartAt: start.toISOString(),
      plannedEndAt: end.toISOString(),
      timezone: input.timezone,
    });
  }

  if (values.length > 0) {
    // D1 limits the number of bound variables in one statement. Eight rows
    // keeps each insert safely below that limit while preserving idempotency.
    for (let index = 0; index < values.length; index += 8) {
      await db
        .insert(sessions)
        .values(values.slice(index, index + 8))
        .onConflictDoNothing();
    }
  }

  return values.length;
}
