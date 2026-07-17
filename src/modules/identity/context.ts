import { and, eq } from "drizzle-orm";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { ensureDatabase, getDb } from "@/db";
import { householdMembers, households, users } from "@/db/schema";
import { newId } from "@/src/shared/ids";

export type HouseholdContext = {
  userId: string;
  householdId: string;
  timezone: string;
  displayName: string;
};

export async function getOrCreateHouseholdContext(
  identity: ChatGPTUser,
): Promise<HouseholdContext> {
  await ensureDatabase();
  const db = getDb();
  const email = identity.email.trim().toLowerCase();
  const existingUsers = await db
    .select()
    .from(users)
    .where(and(eq(users.authProvider, "siwc"), eq(users.email, email)))
    .limit(1);

  let user = existingUsers[0];
  if (!user) {
    const id = newId("usr");
    await db
      .insert(users)
      .values({ id, email, displayName: identity.fullName ?? identity.displayName })
      .onConflictDoNothing();
    [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.authProvider, "siwc"), eq(users.email, email)))
      .limit(1);
  }

  if (!user) throw new Error("Unable to establish the signed-in user.");

  const memberships = await db
    .select({
      householdId: householdMembers.householdId,
      timezone: households.defaultTimezone,
    })
    .from(householdMembers)
    .innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(
      and(
        eq(householdMembers.userId, user.id),
        eq(householdMembers.status, "active"),
      ),
    )
    .limit(1);

  let membership = memberships[0];
  if (!membership) {
    const householdId = newId("hsh");
    await db.insert(households).values({
      id: householdId,
      name: identity.fullName ? `${identity.fullName}'s family` : "My family",
      createdByUserId: user.id,
    });
    await db.insert(householdMembers).values({ householdId, userId: user.id });
    membership = { householdId, timezone: "Asia/Dubai" };
  }

  return {
    userId: user.id,
    householdId: membership.householdId,
    timezone: membership.timezone,
    displayName: user.displayName ?? identity.displayName,
  };
}
