import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    authProvider: text("auth_provider").notNull().default("siwc"),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_provider_email_uidx").on(table.authProvider, table.email)],
);

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("My family"),
  defaultTimezone: text("default_timezone").notNull().default("Asia/Dubai"),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

export const householdMembers = sqliteTable(
  "household_members",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("owner"),
    status: text("status").notNull().default("active"),
    joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.householdId, table.userId] }),
    index("household_members_user_idx").on(table.userId),
  ],
);

export const children = sqliteTable(
  "children",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("blue"),
    archivedAt: text("archived_at"),
    ...timestamps,
  },
  (table) => [index("children_household_idx").on(table.householdId)],
);

export const providers = sqliteTable(
  "providers",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    archivedAt: text("archived_at"),
    ...timestamps,
  },
  (table) => [
    index("providers_household_idx").on(table.householdId),
    uniqueIndex("providers_household_name_uidx").on(table.householdId, table.name),
  ],
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    providerId: text("provider_id").references(() => providers.id),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    archivedAt: text("archived_at"),
    ...timestamps,
  },
  (table) => [index("contacts_household_idx").on(table.householdId)],
);

export const enrollments = sqliteTable(
  "enrollments",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    providerId: text("provider_id").references(() => providers.id),
    subject: text("subject").notNull(),
    displayName: text("display_name").notNull(),
    location: text("location"),
    onlineUrl: text("online_url"),
    timezone: text("timezone").notNull(),
    status: text("status").notNull().default("active"),
    startDate: text("start_date").notNull(),
    archivedAt: text("archived_at"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("enrollments_household_idx").on(table.householdId),
    index("enrollments_child_idx").on(table.childId),
  ],
);

export const enrollmentContacts = sqliteTable(
  "enrollment_contacts",
  {
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.enrollmentId, table.contactId, table.role] }),
    index("enrollment_contacts_contact_idx").on(table.contactId),
    uniqueIndex("enrollment_contacts_primary_teacher_uidx")
      .on(table.enrollmentId)
      .where(sql`${table.role} = 'teacher' AND ${table.isPrimary} = 1`),
  ],
);

export const scheduleRules = sqliteTable(
  "schedule_rules",
  {
    id: text("id").primaryKey(),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    localStartTime: text("local_start_time").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    timezone: text("timezone").notNull(),
    validFrom: text("valid_from").notNull(),
    validTo: text("valid_to"),
    supersededAt: text("superseded_at"),
    ...timestamps,
  },
  (table) => [index("schedule_rules_enrollment_idx").on(table.enrollmentId)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    scheduleRuleId: text("schedule_rule_id").references(() => scheduleRules.id),
    localDate: text("local_date").notNull(),
    plannedStartAt: text("planned_start_at").notNull(),
    plannedEndAt: text("planned_end_at").notNull(),
    timezone: text("timezone").notNull(),
    locationOverride: text("location_override"),
    onlineUrlOverride: text("online_url_override"),
    status: text("status").notNull().default("scheduled"),
    source: text("source").notNull().default("recurrence"),
    reason: text("reason"),
    compensationStatus: text("compensation_status"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sessions_rule_date_uidx").on(table.scheduleRuleId, table.localDate),
    index("sessions_enrollment_start_idx").on(table.enrollmentId, table.plannedStartAt),
    index("sessions_start_status_idx").on(table.plannedStartAt, table.status),
  ],
);

export const sessionLinks = sqliteTable(
  "session_links",
  {
    id: text("id").primaryKey(),
    sourceSessionId: text("source_session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    targetSessionId: text("target_session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    linkType: text("link_type").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("session_links_pair_type_uidx").on(
      table.sourceSessionId,
      table.targetSessionId,
      table.linkType,
    ),
    index("session_links_source_idx").on(table.sourceSessionId),
    index("session_links_target_idx").on(table.targetSessionId),
  ],
);

export const attendanceRecords = sqliteTable("attendance_records", {
  sessionId: text("session_id")
    .primaryKey()
    .references(() => sessions.id, { onDelete: "cascade" }),
  attendanceStatus: text("attendance_status").notNull(),
  punctuality: text("punctuality"),
  minutesLate: integer("minutes_late"),
  note: text("note"),
  recordedByUserId: text("recorded_by_user_id")
    .notNull()
    .references(() => users.id),
  recordedAt: text("recorded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const feeArrangements = sqliteTable(
  "fee_arrangements",
  {
    id: text("id").primaryKey(),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    currency: text("currency").notNull(),
    baseAmountMinor: integer("base_amount_minor").notNull(),
    sessionsIncluded: integer("sessions_included"),
    billingCadence: text("billing_cadence"),
    validFrom: text("valid_from").notNull(),
    validTo: text("valid_to"),
    compensationPolicy: text("compensation_policy").notNull().default("manual"),
    configurationJson: text("configuration_json"),
    status: text("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("fee_arrangements_enrollment_idx").on(table.enrollmentId),
    index("fee_arrangements_status_idx").on(table.status),
  ],
);

export const feeCharges = sqliteTable(
  "fee_charges",
  {
    id: text("id").primaryKey(),
    feeArrangementId: text("fee_arrangement_id")
      .notNull()
      .references(() => feeArrangements.id, { onDelete: "cascade" }),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    dueDate: text("due_date").notNull(),
    suggestedAmountMinor: integer("suggested_amount_minor").notNull(),
    confirmedAmountMinor: integer("confirmed_amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("due"),
    calculationSnapshot: text("calculation_snapshot").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("fee_charges_arrangement_period_uidx").on(
      table.feeArrangementId,
      table.periodStart,
      table.periodEnd,
    ),
    index("fee_charges_due_status_idx").on(table.dueDate, table.status),
  ],
);

export const feeAdjustments = sqliteTable(
  "fee_adjustments",
  {
    id: text("id").primaryKey(),
    feeChargeId: text("fee_charge_id")
      .notNull()
      .references(() => feeCharges.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => sessions.id),
    kind: text("kind").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    sessionQuantity: integer("session_quantity"),
    reason: text("reason").notNull(),
    source: text("source").notNull().default("parent"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("fee_adjustments_charge_idx").on(table.feeChargeId)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    feeChargeId: text("fee_charge_id")
      .notNull()
      .references(() => feeCharges.id, { onDelete: "cascade" }),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    paidAt: text("paid_at").notNull(),
    method: text("method").notNull(),
    reference: text("reference"),
    note: text("note"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("payments_charge_idx").on(table.feeChargeId)],
);

export const sessionCreditEntries = sqliteTable(
  "session_credit_entries",
  {
    id: text("id").primaryKey(),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    feeChargeId: text("fee_charge_id").references(() => feeCharges.id),
    sessionId: text("session_id").references(() => sessions.id),
    entryType: text("entry_type").notNull(),
    quantity: integer("quantity").notNull(),
    reason: text("reason").notNull(),
    occurredAt: text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("session_credit_entries_enrollment_idx").on(table.enrollmentId),
    uniqueIndex("session_credit_entries_charge_type_uidx").on(table.feeChargeId, table.entryType),
    uniqueIndex("session_credit_entries_session_type_uidx").on(table.sessionId, table.entryType),
  ],
);

export const reminderRules = sqliteTable(
  "reminder_rules",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id").references(() => enrollments.id, { onDelete: "cascade" }),
    feeArrangementId: text("fee_arrangement_id").references(() => feeArrangements.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    leadMinutes: integer("lead_minutes").notNull().default(0),
    repeatIntervalMinutes: integer("repeat_interval_minutes"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    timezone: text("timezone").notNull(),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("reminder_rules_household_idx").on(table.householdId),
    index("reminder_rules_enrollment_idx").on(table.enrollmentId),
    index("reminder_rules_fee_arrangement_idx").on(table.feeArrangementId),
  ],
);

export const reminderJobs = sqliteTable(
  "reminder_jobs",
  {
    id: text("id").primaryKey(),
    ruleId: text("rule_id")
      .notNull()
      .references(() => reminderRules.id, { onDelete: "cascade" }),
    relatedRecordType: text("related_record_type").notNull(),
    relatedRecordId: text("related_record_id").notNull(),
    scheduledFor: text("scheduled_for").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    deliveryChannel: text("delivery_channel").notNull().default("browser"),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    sentAt: text("sent_at"),
    nextAttemptAt: text("next_attempt_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("reminder_jobs_idempotency_uidx").on(table.ruleId, table.relatedRecordId, table.scheduledFor),
    index("reminder_jobs_status_schedule_idx").on(table.status, table.scheduledFor),
  ],
);

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    deviceLabel: text("device_label"),
    userAgent: text("user_agent"),
    status: text("status").notNull().default("active"),
    failureCount: integer("failure_count").notNull().default(0),
    lastSuccessAt: text("last_success_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("push_subscriptions_endpoint_uidx").on(table.endpoint),
    index("push_subscriptions_household_status_idx").on(table.householdId, table.status),
  ],
);

export const pushDeliveries = sqliteTable(
  "push_deliveries",
  {
    id: text("id").primaryKey(),
    reminderJobId: text("reminder_job_id")
      .notNull()
      .references(() => reminderJobs.id, { onDelete: "cascade" }),
    pushSubscriptionId: text("push_subscription_id")
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    httpStatus: integer("http_status"),
    errorCode: text("error_code"),
    sentAt: text("sent_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("push_deliveries_job_subscription_uidx").on(table.reminderJobId, table.pushSubscriptionId),
    index("push_deliveries_status_idx").on(table.status, table.createdAt),
  ],
);

export const suggestions = sqliteTable(
  "suggestions",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    evidenceJson: text("evidence_json").notNull(),
    proposedActionJson: text("proposed_action_json").notNull(),
    explanation: text("explanation").notNull(),
    source: text("source").notNull().default("rules_v1"),
    status: text("status").notNull().default("pending"),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
    reviewedAt: text("reviewed_at"),
    expiresAt: text("expires_at"),
    ...timestamps,
  },
  (table) => [
    index("suggestions_household_status_idx").on(table.householdId, table.status),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    occurredAt: text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("audit_events_household_idx").on(table.householdId),
    index("audit_events_entity_idx").on(table.entityType, table.entityId),
  ],
);
