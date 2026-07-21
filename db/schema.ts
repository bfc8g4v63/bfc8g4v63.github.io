import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  eventDate: text("event_date").notNull(),
  startTime: text("start_time").notNull(),
  location: text("location").notNull(),
  description: text("description").notNull().default(""),
  creatorName: text("creator_name").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  capacity: integer("capacity"),
  status: text("status").notNull().default("active"),
  accessMode: text("access_mode").notNull().default("unlisted"),
  attendanceVisibility: text("attendance_visibility").notNull().default("count"),
  shareToken: text("share_token").notNull().default(""),
  participantCodeHash: text("participant_code_hash").notNull().default(""),
  editCodeHash: text("edit_code_hash").notNull(),
  managerTokenHash: text("manager_token_hash").notNull().default(""),
  cancelledAt: text("cancelled_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("events_share_token_unique").on(table.shareToken)]);

export const rsvps = sqliteTable("rsvps", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  partySize: integer("party_size").notNull().default(1),
  diet: text("diet").notNull().default(""),
  note: text("note").notNull().default(""),
  response: text("response").notNull().default("attending"),
  shareName: integer("share_name", { mode: "boolean" }).notNull().default(false),
  viewerTokenHash: text("viewer_token_hash").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("rsvps_event_name_unique").on(table.eventId, table.name)]);

export const lineBindings = sqliteTable("line_bindings", {
  eventId: text("event_id").primaryKey().references(() => events.id, { onDelete: "cascade" }),
  groupId: text("group_id").notNull(),
  groupName: text("group_name").notNull().default("LINE 群組"),
  boundAt: text("bound_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("line_bindings_group_unique").on(table.groupId)]);

export const lineBindCodes = sqliteTable("line_bind_codes", {
  code: text("code").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const lineReminderSettings = sqliteTable("line_reminder_settings", {
  eventId: text("event_id").primaryKey().references(() => events.id, { onDelete: "cascade" }),
  sevenDays: integer("seven_days", { mode: "boolean" }).notNull().default(true),
  oneDay: integer("one_day", { mode: "boolean" }).notNull().default(true),
  twoHours: integer("two_hours", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const lineReminderDeliveries = sqliteTable("line_reminder_deliveries", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  reminderKey: text("reminder_key").notNull(),
  eventFingerprint: text("event_fingerprint").notNull(),
  sentAt: text("sent_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("line_reminder_delivery_unique").on(
  table.eventId, table.reminderKey, table.eventFingerprint,
)]);

export const siteStats = sqliteTable("site_stats", {
  key: text("key").primaryKey(),
  views: integer("views").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
