import { getD1 } from "@/db";
import type { HouseholdContext } from "@/src/modules/identity/context";
import { localDateInZone } from "@/src/shared/dates";
import { newId } from "@/src/shared/ids";

const colors = new Set(["blue", "coral", "green", "gold"]);
const contactRoles = new Set(["teacher", "administration", "payment_support", "other"]);

export class MaintenanceValidationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function getMaintenanceSnapshot(context: HouseholdContext) {
  const d1 = getD1();
  const [household, contacts, links, archivedEnrollments] = await Promise.all([
    d1.prepare("SELECT name, default_timezone AS timezone FROM households WHERE id = ?")
      .bind(context.householdId).first<{ name: string; timezone: string }>(),
    d1.prepare("SELECT contacts.id, contacts.provider_id AS providerId, providers.name AS providerName, contacts.name, contacts.phone, contacts.email, contacts.notes FROM contacts LEFT JOIN providers ON providers.id = contacts.provider_id WHERE contacts.household_id = ? AND contacts.archived_at IS NULL ORDER BY lower(contacts.name)")
      .bind(context.householdId).all<{ id: string; providerId: string | null; providerName: string | null; name: string; phone: string | null; email: string | null; notes: string | null }>(),
    d1.prepare("SELECT links.contact_id AS contactId, links.enrollment_id AS enrollmentId, enrollments.display_name AS enrollmentName, children.name AS childName, links.role, links.is_primary AS isPrimary, enrollments.status AS enrollmentStatus FROM enrollment_contacts links INNER JOIN contacts ON contacts.id = links.contact_id INNER JOIN enrollments ON enrollments.id = links.enrollment_id INNER JOIN children ON children.id = enrollments.child_id WHERE contacts.household_id = ? ORDER BY children.name, enrollments.display_name")
      .bind(context.householdId).all<{ contactId: string; enrollmentId: string; enrollmentName: string; childName: string; role: string; isPrimary: number; enrollmentStatus: string }>(),
    d1.prepare("SELECT enrollments.id, enrollments.child_id AS childId, children.name AS childName, enrollments.display_name AS name, enrollments.subject, enrollments.location, enrollments.online_url AS onlineUrl, enrollments.timezone, enrollments.version, providers.name AS providerName, enrollments.archived_at AS archivedAt FROM enrollments INNER JOIN children ON children.id = enrollments.child_id LEFT JOIN providers ON providers.id = enrollments.provider_id WHERE enrollments.household_id = ? AND enrollments.status = 'archived' ORDER BY enrollments.archived_at DESC")
      .bind(context.householdId).all<{ id: string; childId: string; childName: string; name: string; subject: string; location: string | null; onlineUrl: string | null; timezone: string; version: number; providerName: string | null; archivedAt: string }>(),
  ]);

  return {
    household: household ?? { name: "My family", timezone: context.timezone },
    contacts: contacts.results.map((contact) => ({
      ...contact,
      links: links.results.filter((link) => link.contactId === contact.id).map((link) => ({ ...link, isPrimary: Boolean(link.isPrimary) })),
    })),
    archivedEnrollments: archivedEnrollments.results,
  };
}

export async function updateHousehold(context: HouseholdContext, input: { name?: string; timezone?: string }) {
  const name = requiredText(input.name, "Enter a household name.", 100);
  const timezone = requiredText(input.timezone, "Choose a timezone.", 80);
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
  } catch {
    throw new MaintenanceValidationError("Choose a valid IANA timezone, such as Asia/Dubai.");
  }
  await getD1().prepare("UPDATE households SET name = ?, default_timezone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(name, timezone, context.householdId).run();
  return { name, timezone };
}

export async function updateChild(context: HouseholdContext, childId: string, input: { name?: string; color?: string }) {
  const name = requiredText(input.name, "Enter a child name.", 80);
  const color = colors.has(input.color ?? "") ? input.color! : "blue";
  const result = await getD1().prepare("UPDATE children SET name = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND household_id = ? AND archived_at IS NULL")
    .bind(name, color, childId, context.householdId).run();
  if (result.meta.changes !== 1) throw new MaintenanceValidationError("Child not found.", 404);
  return { childId, name, color };
}

export async function createContact(context: HouseholdContext, input: ContactInput) {
  const contact = normalizeContact(input);
  const providerId = await resolveProvider(context, contact.providerName);
  const id = newId("con");
  await getD1().prepare("INSERT INTO contacts (id, household_id, provider_id, name, phone, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, context.householdId, providerId, contact.name, contact.phone, contact.email, contact.notes).run();
  return { contactId: id };
}

export async function updateContact(context: HouseholdContext, contactId: string, input: ContactInput) {
  const contact = normalizeContact(input);
  const providerId = await resolveProvider(context, contact.providerName);
  const result = await getD1().prepare("UPDATE contacts SET provider_id = ?, name = ?, phone = ?, email = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND household_id = ? AND archived_at IS NULL")
    .bind(providerId, contact.name, contact.phone, contact.email, contact.notes, contactId, context.householdId).run();
  if (result.meta.changes !== 1) throw new MaintenanceValidationError("Contact not found.", 404);
  return { contactId };
}

export async function archiveContact(context: HouseholdContext, contactId: string) {
  const activeLink = await getD1().prepare("SELECT 1 AS linked FROM enrollment_contacts links INNER JOIN enrollments ON enrollments.id = links.enrollment_id INNER JOIN contacts ON contacts.id = links.contact_id WHERE contacts.id = ? AND contacts.household_id = ? AND enrollments.status = 'active' LIMIT 1")
    .bind(contactId, context.householdId).first<{ linked: number }>();
  if (activeLink) throw new MaintenanceValidationError("Remove this contact from active classes before archiving it.", 409);
  const result = await getD1().prepare("UPDATE contacts SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND household_id = ? AND archived_at IS NULL")
    .bind(contactId, context.householdId).run();
  if (result.meta.changes !== 1) throw new MaintenanceValidationError("Contact not found.", 404);
  return { contactId, status: "archived" };
}

export async function updateEnrollment(context: HouseholdContext, enrollmentId: string, input: EnrollmentInput) {
  const subject = requiredText(input.subject, "Enter a subject.", 100);
  const displayName = optionalText(input.displayName, 100) ?? subject;
  const providerName = requiredText(input.providerName, "Enter an institute or teacher business.", 120);
  const location = optionalText(input.location, 160);
  const onlineUrl = optionalUrl(input.onlineUrl);
  const version = Number(input.version);
  if (!Number.isInteger(version) || version < 1) throw new MaintenanceValidationError("Refresh and try again.", 409);
  const providerId = await resolveProvider(context, providerName);
  const result = await getD1().prepare("UPDATE enrollments SET provider_id = ?, subject = ?, display_name = ?, location = ?, online_url = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND household_id = ? AND status = 'active' AND version = ?")
    .bind(providerId, subject, displayName, location, onlineUrl, enrollmentId, context.householdId, version).run();
  if (result.meta.changes !== 1) throw new MaintenanceValidationError("This class changed on another screen. Refresh and try again.", 409);
  return { enrollmentId, version: version + 1 };
}

export async function linkEnrollmentContact(context: HouseholdContext, enrollmentId: string, input: { contactId?: string; role?: string; isPrimary?: boolean }) {
  const role = input.role ?? "";
  if (!contactRoles.has(role)) throw new MaintenanceValidationError("Choose a valid contact role.");
  const d1 = getD1();
  const owned = await d1.prepare("SELECT 1 AS owned FROM enrollments INNER JOIN contacts ON contacts.id = ? WHERE enrollments.id = ? AND enrollments.household_id = ? AND contacts.household_id = ? AND enrollments.status = 'active' AND contacts.archived_at IS NULL")
    .bind(input.contactId ?? "", enrollmentId, context.householdId, context.householdId).first<{ owned: number }>();
  if (!owned) throw new MaintenanceValidationError("Class or contact not found.", 404);
  const primary = role === "teacher" && input.isPrimary === true;
  const statements = [];
  if (primary) statements.push(d1.prepare("UPDATE enrollment_contacts SET is_primary = 0 WHERE enrollment_id = ? AND role = 'teacher'").bind(enrollmentId));
  statements.push(d1.prepare("INSERT INTO enrollment_contacts (enrollment_id, contact_id, role, is_primary) VALUES (?, ?, ?, ?) ON CONFLICT(enrollment_id, contact_id, role) DO UPDATE SET is_primary = excluded.is_primary")
    .bind(enrollmentId, input.contactId, role, primary ? 1 : 0));
  await d1.batch(statements);
  return { enrollmentId, contactId: input.contactId, role, isPrimary: primary };
}

export async function unlinkEnrollmentContact(context: HouseholdContext, enrollmentId: string, input: { contactId?: string; role?: string }) {
  const result = await getD1().prepare("DELETE FROM enrollment_contacts WHERE enrollment_id = ? AND contact_id = ? AND role = ? AND enrollment_id IN (SELECT id FROM enrollments WHERE household_id = ? AND status = 'active')")
    .bind(enrollmentId, input.contactId ?? "", input.role ?? "", context.householdId).run();
  if (result.meta.changes !== 1) throw new MaintenanceValidationError("Contact link not found.", 404);
  return { enrollmentId, contactId: input.contactId, status: "unlinked" };
}

export async function archiveEnrollment(context: HouseholdContext, enrollmentId: string) {
  const d1 = getD1();
  const owned = await d1.prepare("SELECT id, timezone FROM enrollments WHERE id = ? AND household_id = ? AND status = 'active'")
    .bind(enrollmentId, context.householdId).first<{ id: string; timezone: string }>();
  if (!owned) throw new MaintenanceValidationError("Active class not found.", 404);
  const today = localDateInZone(new Date(), owned.timezone);
  const now = new Date().toISOString();
  await d1.batch([
    d1.prepare("UPDATE enrollments SET status = 'archived', archived_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(enrollmentId),
    d1.prepare("UPDATE schedule_rules SET valid_to = ?, superseded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE enrollment_id = ? AND superseded_at IS NULL").bind(today, enrollmentId),
    d1.prepare("UPDATE sessions SET status = 'cancelled', reason = 'Enrollment archived', version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE enrollment_id = ? AND source = 'recurrence' AND status = 'scheduled' AND planned_start_at >= ? AND NOT EXISTS (SELECT 1 FROM attendance_records WHERE attendance_records.session_id = sessions.id)").bind(enrollmentId, now),
    d1.prepare("UPDATE fee_arrangements SET status = 'archived', valid_to = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE enrollment_id = ? AND status = 'active'").bind(today, enrollmentId),
    d1.prepare("UPDATE reminder_jobs SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE status = 'pending' AND related_record_type = 'session' AND related_record_id IN (SELECT id FROM sessions WHERE enrollment_id = ? AND status = 'cancelled' AND reason = 'Enrollment archived')").bind(enrollmentId),
    d1.prepare("INSERT INTO audit_events (id, household_id, actor_user_id, entity_type, entity_id, action, after_json) VALUES (?, ?, ?, 'enrollment', ?, 'archived', ?)").bind(newId("aud"), context.householdId, context.userId, enrollmentId, JSON.stringify({ archivedAt: new Date().toISOString() })),
  ]);
  return { enrollmentId, status: "archived" };
}

export async function restoreEnrollment(context: HouseholdContext, enrollmentId: string) {
  const d1 = getD1();
  const latestRule = await d1.prepare("SELECT id, weekday, local_start_time AS startTime, duration_minutes AS durationMinutes, timezone FROM schedule_rules WHERE enrollment_id = ? AND enrollment_id IN (SELECT id FROM enrollments WHERE household_id = ? AND status = 'archived') ORDER BY created_at DESC LIMIT 1")
    .bind(enrollmentId, context.householdId).first<{ id: string; weekday: number; startTime: string; durationMinutes: number; timezone: string }>();
  if (!latestRule) throw new MaintenanceValidationError("Archived class or schedule not found.", 404);
  const today = localDateInZone(new Date(), latestRule.timezone);
  await d1.batch([
    d1.prepare("UPDATE enrollments SET status = 'active', archived_at = NULL, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND household_id = ? AND status = 'archived'").bind(enrollmentId, context.householdId),
    d1.prepare("UPDATE schedule_rules SET valid_to = NULL, superseded_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(latestRule.id),
    d1.prepare("UPDATE sessions SET status = 'scheduled', reason = NULL, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE enrollment_id = ? AND schedule_rule_id = ? AND source = 'recurrence' AND status = 'cancelled' AND reason = 'Enrollment archived' AND local_date >= ?").bind(enrollmentId, latestRule.id, today),
    d1.prepare("UPDATE fee_arrangements SET status = 'active', valid_to = NULL, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM fee_arrangements WHERE enrollment_id = ? ORDER BY created_at DESC LIMIT 1) AND NOT EXISTS (SELECT 1 FROM fee_arrangements WHERE enrollment_id = ? AND status = 'active')").bind(enrollmentId, enrollmentId),
    d1.prepare("INSERT INTO audit_events (id, household_id, actor_user_id, entity_type, entity_id, action, after_json) VALUES (?, ?, ?, 'enrollment', ?, 'restored', ?)").bind(newId("aud"), context.householdId, context.userId, enrollmentId, JSON.stringify({ restoredAt: new Date().toISOString() })),
  ]);
  const { generateSessions } = await import("@/src/modules/scheduling/generate-sessions");
  await generateSessions({ enrollmentId, scheduleRuleId: latestRule.id, weekday: latestRule.weekday, localStartTime: latestRule.startTime, durationMinutes: latestRule.durationMinutes, timezone: latestRule.timezone, validFrom: today });
  return { enrollmentId, status: "active" };
}

type ContactInput = { name?: string; phone?: string; email?: string; notes?: string; providerName?: string };
type EnrollmentInput = { subject?: string; displayName?: string; providerName?: string; location?: string; onlineUrl?: string; version?: number };

function normalizeContact(input: ContactInput) {
  const name = requiredText(input.name, "Enter a contact name.", 100);
  const phone = optionalText(input.phone, 40);
  const email = optionalText(input.email, 160)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new MaintenanceValidationError("Enter a valid email address.");
  const notes = optionalText(input.notes, 500);
  const providerName = optionalText(input.providerName, 120);
  return { name, phone, email, notes, providerName };
}

async function resolveProvider(context: HouseholdContext, providerName: string | null) {
  if (!providerName) return null;
  const d1 = getD1();
  const existing = await d1.prepare("SELECT id FROM providers WHERE household_id = ? AND lower(name) = lower(?) LIMIT 1")
    .bind(context.householdId, providerName).first<{ id: string }>();
  if (existing) return existing.id;
  const id = newId("prv");
  await d1.prepare("INSERT INTO providers (id, household_id, name) VALUES (?, ?, ?)").bind(id, context.householdId, providerName).run();
  return id;
}

function requiredText(value: string | undefined, message: string, max: number) {
  const normalized = value?.trim();
  if (!normalized || normalized.length > max) throw new MaintenanceValidationError(message);
  return normalized;
}

function optionalText(value: string | undefined, max: number) {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > max) throw new MaintenanceValidationError(`Keep this field under ${max} characters.`);
  return normalized;
}

function optionalUrl(value: string | undefined) {
  const normalized = optionalText(value, 500);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return url.toString();
  } catch {
    throw new MaintenanceValidationError("Enter a valid http or https online-class link.");
  }
}
