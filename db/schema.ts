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
