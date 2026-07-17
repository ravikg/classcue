import { env } from "cloudflare:workers";
import { getD1 } from "@/db";
import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { newId } from "@/src/shared/ids";

type SubscriptionInput = {
  action?: "unsubscribe";
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  deviceLabel?: string;
};

export async function GET() {
  try {
    const context = await requireApiContext();
    const subscriptions = await getD1().prepare(
      "SELECT endpoint, device_label AS deviceLabel, status, last_success_at AS lastSuccessAt FROM push_subscriptions WHERE household_id = ? AND user_id = ? AND status = 'active' ORDER BY updated_at DESC",
    ).bind(context.householdId, context.userId).all();
    return Response.json({
      configured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT),
      publicKey: env.VAPID_PUBLIC_KEY ?? null,
      subscriptions: subscriptions.results,
    });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiContext();
    const body = await request.json() as SubscriptionInput;
    const endpoint = validEndpoint(body.endpoint);
    const d1 = getD1();
    if (body.action === "unsubscribe") {
      await d1.prepare("UPDATE push_subscriptions SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE endpoint = ? AND household_id = ? AND user_id = ?")
        .bind(endpoint, context.householdId, context.userId).run();
      return Response.json({ status: "revoked" });
    }
    const p256dh = required(body.keys?.p256dh, "The notification subscription is incomplete.", 512);
    const auth = required(body.keys?.auth, "The notification subscription is incomplete.", 512);
    const deviceLabel = optional(body.deviceLabel, 100);
    const userAgent = optional(request.headers.get("user-agent") ?? undefined, 500);
    const existing = await d1.prepare("SELECT household_id AS householdId, user_id AS userId FROM push_subscriptions WHERE endpoint = ?")
      .bind(endpoint).first<{ householdId: string; userId: string }>();
    if (existing && (existing.householdId !== context.householdId || existing.userId !== context.userId)) {
      throw new PushValidationError("This notification subscription belongs to another account.", 409);
    }
    await d1.prepare(
      "INSERT INTO push_subscriptions (id, household_id, user_id, endpoint, p256dh, auth, device_label, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET household_id = excluded.household_id, user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device_label = excluded.device_label, user_agent = excluded.user_agent, status = 'active', failure_count = 0, updated_at = CURRENT_TIMESTAMP",
    ).bind(newId("psb"), context.householdId, context.userId, endpoint, p256dh, auth, deviceLabel, userAgent).run();
    await d1.prepare("UPDATE reminder_jobs SET next_attempt_at = NULL, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE status = 'pending' AND rule_id IN (SELECT id FROM reminder_rules WHERE household_id = ?)")
      .bind(context.householdId).run();
    return Response.json({ status: "active" }, { status: 201 });
  } catch (error) {
    if (error instanceof PushValidationError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}

class PushValidationError extends Error { constructor(message: string, public status = 400) { super(message); } }
function validEndpoint(value?: string) {
  const endpoint = required(value, "The notification subscription is incomplete.", 2_048);
  try { if (new URL(endpoint).protocol !== "https:") throw new Error(); } catch { throw new PushValidationError("The notification endpoint is invalid."); }
  return endpoint;
}
function required(value: string | undefined, message: string, max: number) {
  const normalized = value?.trim();
  if (!normalized || normalized.length > max) throw new PushValidationError(message);
  return normalized;
}
function optional(value: string | undefined, max: number) {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > max) throw new PushValidationError(`Keep this field under ${max} characters.`);
  return normalized;
}
