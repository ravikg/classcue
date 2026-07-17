import webPush from "web-push";
import { newId } from "@/src/shared/ids";

export type PushEnvironment = {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

type DueJob = {
  id: string;
  householdId: string;
  type: string;
  relatedRecordType: string;
  relatedRecordId: string;
  scheduledFor: string;
  attempts: number;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function dispatchDuePushJobs(d1: D1Database, environment: PushEnvironment) {
  const publicKey = environment.VAPID_PUBLIC_KEY?.trim();
  const privateKey = environment.VAPID_PRIVATE_KEY?.trim();
  const subject = environment.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return { configured: false, jobs: 0, delivered: 0, failed: 0 };

  webPush.setVapidDetails(subject, publicKey, privateKey);
  const now = new Date();
  const due = await d1.prepare(
    "SELECT jobs.id, rules.household_id AS householdId, rules.type, jobs.related_record_type AS relatedRecordType, jobs.related_record_id AS relatedRecordId, jobs.scheduled_for AS scheduledFor, jobs.attempts FROM reminder_jobs jobs INNER JOIN reminder_rules rules ON rules.id = jobs.rule_id WHERE jobs.status = 'pending' AND rules.enabled = 1 AND jobs.scheduled_for <= ? AND (jobs.next_attempt_at IS NULL OR jobs.next_attempt_at <= ?) AND jobs.attempts < 8 ORDER BY jobs.scheduled_for LIMIT 50",
  ).bind(now.toISOString(), now.toISOString()).all<DueJob>();

  let delivered = 0;
  let failed = 0;
  for (const job of due.results) {
    const payload = await reminderPayload(d1, job);
    if (!payload) {
      await d1.prepare("UPDATE reminder_jobs SET status = 'cancelled', last_error = 'related_record_unavailable', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'")
        .bind(job.id).run();
      continue;
    }

    const subscriptions = await d1.prepare(
      "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE household_id = ? AND status = 'active' ORDER BY created_at",
    ).bind(job.householdId).all<SubscriptionRow>();
    if (subscriptions.results.length === 0) {
      await d1.prepare("UPDATE reminder_jobs SET next_attempt_at = ?, last_error = 'no_active_push_subscription', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'")
        .bind(new Date(now.getTime() + 60 * 60_000).toISOString(), job.id).run();
      continue;
    }

    let successfulDevices = 0;
    let lastError = "push_delivery_failed";
    for (const subscription of subscriptions.results) {
      const previous = await d1.prepare("SELECT status FROM push_deliveries WHERE reminder_job_id = ? AND push_subscription_id = ?")
        .bind(job.id, subscription.id).first<{ status: string }>();
      if (previous?.status === "delivered") { successfulDevices += 1; continue; }
      try {
        const response = await webPush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify({ ...payload, tag: job.id, url: `/?reminder=${job.id}` }),
          { TTL: 86_400, urgency: job.type === "fee_overdue" ? "high" : "normal" },
        );
        await d1.batch([
          d1.prepare("INSERT INTO push_deliveries (id, reminder_job_id, push_subscription_id, status, http_status, sent_at) VALUES (?, ?, ?, 'delivered', ?, CURRENT_TIMESTAMP) ON CONFLICT(reminder_job_id, push_subscription_id) DO UPDATE SET status = 'delivered', http_status = excluded.http_status, error_code = NULL, sent_at = CURRENT_TIMESTAMP")
            .bind(newId("pdl"), job.id, subscription.id, response.statusCode),
          d1.prepare("UPDATE push_subscriptions SET failure_count = 0, last_success_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(subscription.id),
        ]);
        successfulDevices += 1;
      } catch (error) {
        const statusCode = pushStatusCode(error);
        const expired = statusCode === 404 || statusCode === 410;
        lastError = expired ? "subscription_expired" : `push_${statusCode || "error"}`;
        await d1.batch([
          d1.prepare("INSERT INTO push_deliveries (id, reminder_job_id, push_subscription_id, status, http_status, error_code) VALUES (?, ?, ?, 'failed', ?, ?) ON CONFLICT(reminder_job_id, push_subscription_id) DO UPDATE SET status = 'failed', http_status = excluded.http_status, error_code = excluded.error_code")
            .bind(newId("pdl"), job.id, subscription.id, statusCode || null, lastError),
          d1.prepare("UPDATE push_subscriptions SET status = CASE WHEN ? THEN 'expired' ELSE status END, failure_count = failure_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(expired ? 1 : 0, subscription.id),
        ]);
      }
    }

    if (successfulDevices > 0) {
      await d1.prepare("UPDATE reminder_jobs SET status = 'delivered', delivery_channel = 'web_push', attempts = attempts + 1, sent_at = CURRENT_TIMESTAMP, next_attempt_at = NULL, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'")
        .bind(job.id).run();
      delivered += 1;
    } else {
      const attempts = job.attempts + 1;
      const retryMinutes = Math.min(360, 5 * 2 ** Math.min(attempts, 6));
      await d1.prepare("UPDATE reminder_jobs SET status = CASE WHEN ? >= 8 THEN 'failed' ELSE 'pending' END, attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'")
        .bind(attempts, attempts, new Date(now.getTime() + retryMinutes * 60_000).toISOString(), lastError, job.id).run();
      failed += 1;
    }
  }

  return { configured: true, jobs: due.results.length, delivered, failed };
}

async function reminderPayload(d1: D1Database, job: DueJob) {
  if (job.relatedRecordType === "session") {
    const row = await d1.prepare(
      "SELECT sessions.planned_start_at AS plannedStartAt, sessions.timezone, COALESCE(sessions.location_override, enrollments.location) AS location, COALESCE(sessions.online_url_override, enrollments.online_url) AS onlineUrl, children.name AS childName, enrollments.display_name AS enrollmentName, contacts.name AS teacherName, contacts.phone AS teacherPhone FROM sessions INNER JOIN enrollments ON enrollments.id = sessions.enrollment_id INNER JOIN children ON children.id = enrollments.child_id LEFT JOIN enrollment_contacts links ON links.enrollment_id = enrollments.id AND links.role = 'teacher' AND links.is_primary = 1 LEFT JOIN contacts ON contacts.id = links.contact_id WHERE sessions.id = ? AND enrollments.household_id = ? AND sessions.status IN ('scheduled', 'makeup')",
    ).bind(job.relatedRecordId, job.householdId).first<{ plannedStartAt: string; timezone: string; location: string | null; onlineUrl: string | null; childName: string; enrollmentName: string; teacherName: string | null; teacherPhone: string | null }>();
    if (!row) return null;
    const time = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: row.timezone }).format(new Date(row.plannedStartAt));
    const place = row.location ? ` at ${row.location}` : row.onlineUrl ? " online" : "";
    const teacher = row.teacherName ? ` Teacher: ${row.teacherName}${row.teacherPhone ? ` (${row.teacherPhone})` : ""}.` : "";
    return { title: `${row.childName} · ${row.enrollmentName}`, body: `${row.childName}'s ${row.enrollmentName} is ${time}${place}.${teacher}` };
  }

  if (job.relatedRecordType === "fee_charge") {
    const row = await d1.prepare(
      "SELECT charges.due_date AS dueDate, charges.confirmed_amount_minor AS amountMinor, charges.currency, charges.status, children.name AS childName, enrollments.display_name AS enrollmentName FROM fee_charges charges INNER JOIN fee_arrangements arrangements ON arrangements.id = charges.fee_arrangement_id INNER JOIN enrollments ON enrollments.id = arrangements.enrollment_id INNER JOIN children ON children.id = enrollments.child_id WHERE charges.id = ? AND enrollments.household_id = ? AND charges.status = 'due'",
    ).bind(job.relatedRecordId, job.householdId).first<{ dueDate: string; amountMinor: number; currency: string; status: string; childName: string; enrollmentName: string }>();
    if (!row) return null;
    const due = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${row.dueDate}T12:00:00Z`));
    const overdue = job.type === "fee_overdue";
    return { title: overdue ? "Overdue fee" : "Upcoming fee", body: `${row.childName}'s ${row.enrollmentName} fee of ${formatMoney(row.amountMinor, row.currency)} ${overdue ? "was" : "is"} due ${due}.` };
  }
  return null;
}

function formatMoney(amountMinor: number, currency: string) {
  const decimals = ["BHD", "JOD", "KWD", "OMR", "TND"].includes(currency) ? 3 : ["JPY", "KRW", "VND"].includes(currency) ? 0 : 2;
  return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amountMinor / 10 ** decimals);
}

function pushStatusCode(error: unknown) {
  return typeof error === "object" && error !== null && "statusCode" in error && typeof (error as { statusCode?: unknown }).statusCode === "number"
    ? (error as { statusCode: number }).statusCode
    : 0;
}
