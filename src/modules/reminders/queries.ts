import { getD1 } from "@/db";
import type { HouseholdContext } from "@/src/modules/identity/context";

type ClassJobRow = {
  id: string;
  type: string;
  scheduledFor: string;
  status: string;
  sentAt: string | null;
  sessionId: string;
  localDate: string;
  plannedStartAt: string;
  timezone: string;
  location: string | null;
  onlineUrl: string | null;
  childName: string;
  enrollmentName: string;
  teacherName: string | null;
  teacherPhone: string | null;
};

type FeeJobRow = {
  id: string;
  type: string;
  scheduledFor: string;
  status: string;
  sentAt: string | null;
  chargeId: string;
  dueDate: string;
  confirmedAmountMinor: number;
  currency: string;
  childName: string;
  enrollmentName: string;
};

export async function getReminderSnapshot(context: HouseholdContext) {
  const d1 = getD1();
  const [rulesResult, classJobsResult, feeJobsResult] = await Promise.all([
    d1.prepare(
      "SELECT rules.id, rules.type, rules.lead_minutes AS leadMinutes, rules.repeat_interval_minutes AS repeatIntervalMinutes, rules.enabled, rules.enrollment_id AS enrollmentId, rules.fee_arrangement_id AS feeArrangementId, COALESCE(class_child.name || ' · ' || class_enrollment.display_name, fee_child.name || ' · ' || fee_enrollment.display_name) AS targetName FROM reminder_rules rules LEFT JOIN enrollments class_enrollment ON class_enrollment.id = rules.enrollment_id LEFT JOIN children class_child ON class_child.id = class_enrollment.child_id LEFT JOIN fee_arrangements arrangements ON arrangements.id = rules.fee_arrangement_id LEFT JOIN enrollments fee_enrollment ON fee_enrollment.id = arrangements.enrollment_id LEFT JOIN children fee_child ON fee_child.id = fee_enrollment.child_id WHERE rules.household_id = ? ORDER BY rules.created_at",
    ).bind(context.householdId).all<{ id: string; type: string; leadMinutes: number; repeatIntervalMinutes: number | null; enabled: number; enrollmentId: string | null; feeArrangementId: string | null; targetName: string }>(),
    d1.prepare(
      "SELECT jobs.id, rules.type, jobs.scheduled_for AS scheduledFor, jobs.status, jobs.sent_at AS sentAt, sessions.id AS sessionId, sessions.local_date AS localDate, sessions.planned_start_at AS plannedStartAt, sessions.timezone, COALESCE(sessions.location_override, enrollments.location) AS location, COALESCE(sessions.online_url_override, enrollments.online_url) AS onlineUrl, children.name AS childName, enrollments.display_name AS enrollmentName, contacts.name AS teacherName, contacts.phone AS teacherPhone FROM reminder_jobs jobs INNER JOIN reminder_rules rules ON rules.id = jobs.rule_id INNER JOIN sessions ON jobs.related_record_type = 'session' AND sessions.id = jobs.related_record_id INNER JOIN enrollments ON enrollments.id = sessions.enrollment_id INNER JOIN children ON children.id = enrollments.child_id LEFT JOIN enrollment_contacts links ON links.enrollment_id = enrollments.id AND links.role = 'teacher' AND links.is_primary = 1 LEFT JOIN contacts ON contacts.id = links.contact_id WHERE rules.household_id = ? AND jobs.status IN ('pending', 'delivered', 'dismissed') ORDER BY jobs.scheduled_for",
    ).bind(context.householdId).all<ClassJobRow>(),
    d1.prepare(
      "SELECT jobs.id, rules.type, jobs.scheduled_for AS scheduledFor, jobs.status, jobs.sent_at AS sentAt, charges.id AS chargeId, charges.due_date AS dueDate, charges.confirmed_amount_minor AS confirmedAmountMinor, charges.currency, children.name AS childName, enrollments.display_name AS enrollmentName FROM reminder_jobs jobs INNER JOIN reminder_rules rules ON rules.id = jobs.rule_id INNER JOIN fee_charges charges ON jobs.related_record_type = 'fee_charge' AND charges.id = jobs.related_record_id INNER JOIN fee_arrangements arrangements ON arrangements.id = charges.fee_arrangement_id INNER JOIN enrollments ON enrollments.id = arrangements.enrollment_id INNER JOIN children ON children.id = enrollments.child_id WHERE rules.household_id = ? AND jobs.status IN ('pending', 'delivered', 'dismissed') ORDER BY jobs.scheduled_for",
    ).bind(context.householdId).all<FeeJobRow>(),
  ]);

  const jobs = [
    ...classJobsResult.results.map(classJob),
    ...feeJobsResult.results.map(feeJob),
  ].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const now = new Date().toISOString();
  return {
    rules: rulesResult.results.map((rule) => ({ ...rule, enabled: Boolean(rule.enabled) })),
    dueJobs: jobs.filter((job) => job.status === "pending" && job.scheduledFor <= now),
    upcomingJobs: jobs.filter((job) => job.status === "pending" && job.scheduledFor > now).slice(0, 12),
    deliveryHistory: jobs.filter((job) => job.status !== "pending").sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor)).slice(0, 12),
  };
}

function classJob(row: ClassJobRow) {
  const classTime = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: row.timezone }).format(new Date(row.plannedStartAt));
  const contact = row.teacherName ? ` Teacher: ${row.teacherName}${row.teacherPhone ? ` (${row.teacherPhone})` : ""}.` : "";
  const place = row.location ? ` at ${row.location}` : row.onlineUrl ? ` online: ${row.onlineUrl}` : "";
  const body = `${row.childName}'s ${row.enrollmentName} is ${classTime}${place}.${contact}`;
  return { id: row.id, type: row.type, scheduledFor: row.scheduledFor, status: row.status, sentAt: row.sentAt, title: `${row.childName} · ${row.enrollmentName}`, body, shareText: body, relatedRecordType: "session", relatedRecordId: row.sessionId };
}

function feeJob(row: FeeJobRow) {
  const amount = formatMoney(row.confirmedAmountMinor, row.currency);
  const due = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${row.dueDate}T12:00:00Z`));
  const overdue = row.type === "fee_overdue";
  const body = `${row.childName}'s ${row.enrollmentName} fee of ${amount} ${overdue ? `was due ${due}` : `is due ${due}`}.`;
  return { id: row.id, type: row.type, scheduledFor: row.scheduledFor, status: row.status, sentAt: row.sentAt, title: overdue ? "Overdue fee" : "Upcoming fee", body, shareText: body, relatedRecordType: "fee_charge", relatedRecordId: row.chargeId };
}

function formatMoney(amountMinor: number, currency: string) {
  const decimals = ["BHD", "JOD", "KWD", "OMR", "TND"].includes(currency) ? 3 : ["JPY", "KRW", "VND"].includes(currency) ? 0 : 2;
  return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amountMinor / 10 ** decimals);
}
