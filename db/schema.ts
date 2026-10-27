import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  eventDate: text("event_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull().default(""),
  location: text("location").notNull(),
  address: text("address").notNull().default(""),
  description: text("description").notNull().default(""),
  creatorName: text("creator_name").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  capacity: integer("capacity"),
  feePerPerson: integer("fee_per_person").notNull().default(0),
  status: text("status").notNull().default("active"),
  accessMode: text("access_mode").notNull().default("unlisted"),
  attendanceVisibility: text("attendance_visibility").notNull().default("count"),
  autoFillMealSeating: integer("auto_fill_meal_seating", { mode: "boolean" }).notNull().default(false),
  shareToken: text("share_token").notNull().default(""),
  shareCode: text("share_code").notNull().default(""),
  participantCodeHash: text("participant_code_hash").notNull().default(""),
  editCodeHash: text("edit_code_hash").notNull(),
  managerTokenHash: text("manager_token_hash").notNull().default(""),
  cancelledAt: text("cancelled_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("events_share_token_unique").on(table.shareToken),
  uniqueIndex("events_share_code_unique").on(table.shareCode),
]);

export const rsvps = sqliteTable("rsvps", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  partySize: integer("party_size").notNull().default(1),
  diet: text("diet").notNull().default(""),
  note: text("note").notNull().default(""),
  response: text("response").notNull().default("attending"),
  paymentStatus: text("payment_status").notNull().default("not_applicable"),
  shareName: integer("share_name", { mode: "boolean" }).notNull().default(false),
  viewerTokenHash: text("viewer_token_hash").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("rsvps_event_name_unique").on(table.eventId, table.name)]);

// Event-only, opt-in companion cards. These deliberately contain neither
// contact details nor a message thread: an accepted request means meet at the
// activity, not a new private channel.
export const companionCards = sqliteTable("companion_cards", {
  rsvpId: text("rsvp_id").primaryKey().references(() => rsvps.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  intro: text("intro").notNull().default(""),
  interests: text("interests").notNull().default("[]"),
  intents: text("intents").notNull().default("[]"),
  isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("companion_cards_event_visible_updated").on(table.eventId, table.isVisible, table.updatedAt)]);

export const companionRequests = sqliteTable("companion_requests", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  fromRsvpId: text("from_rsvp_id").notNull().references(() => rsvps.id, { onDelete: "cascade" }),
  toRsvpId: text("to_rsvp_id").notNull().references(() => rsvps.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("companion_requests_event_from_to_kind_unique").on(table.eventId, table.fromRsvpId, table.toRsvpId, table.kind),
  index("companion_requests_event_to_status").on(table.eventId, table.toRsvpId, table.status),
  index("companion_requests_event_from_status").on(table.eventId, table.fromRsvpId, table.status),
]);

export const lineBindings = sqliteTable("line_bindings", {
  eventId: text("event_id").primaryKey().references(() => events.id, { onDelete: "cascade" }),
  groupId: text("group_id").notNull(),
  groupName: text("group_name").notNull().default("LINE 群組"),
  boundAt: text("bound_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("line_bindings_group_event").on(table.groupId, table.eventId)]);

// A group is registered once, then an owner can attach several future events
// to it. The credential hash keeps the saved group list private to its owner.
export const lineGroups = sqliteTable("line_groups", {
  groupId: text("group_id").primaryKey(),
  groupName: text("group_name").notNull().default("LINE 群組"),
  ownerCredentialHash: text("owner_credential_hash").notNull().default(""),
  isTest: integer("is_test", { mode: "boolean" }).notNull().default(false),
  boundAt: text("bound_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// New activities may notify more than one already verified group. The older
// line_bindings table remains as the first/legacy destination so existing
// activities and reminder records keep working without a data migration.
export const activityLineGroups = sqliteTable("activity_line_groups", {
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  groupId: text("group_id").notNull(),
  groupName: text("group_name").notNull().default("LINE 群組"),
  boundAt: text("bound_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("activity_line_groups_event_group_unique").on(table.eventId, table.groupId),
  index("activity_line_groups_group_event").on(table.groupId, table.eventId),
]);

export const lineBindCodes = sqliteTable("line_bind_codes", {
  code: text("code").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  ownerCredentialHash: text("owner_credential_hash").notNull().default(""),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// A manager is identified by the LINE account that completes a short-lived
// pairing, never by the display name entered while creating an activity.
export const lineManagerBindCodes = sqliteTable("line_manager_bind_codes", {
  code: text("code").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Recovery can pair one LINE account with several upcoming activities in a
// single step. Event IDs are kept as a JSON array because the code itself is
// short-lived and is consumed exactly once by the LINE webhook.
export const lineManagerBatchBindCodes = sqliteTable("line_manager_batch_bind_codes", {
  code: text("code").primaryKey(),
  eventIds: text("event_ids").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const lineManagerTargets = sqliteTable("line_manager_targets", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  lineUserId: text("line_user_id").notNull(),
  pairedAt: text("paired_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("line_manager_targets_event_user_unique").on(table.eventId, table.lineUserId),
  index("line_manager_targets_event_updated").on(table.eventId, table.updatedAt),
]);

export const lineReminderSettings = sqliteTable("line_reminder_settings", {
  eventId: text("event_id").primaryKey().references(() => events.id, { onDelete: "cascade" }),
  sevenDays: integer("seven_days", { mode: "boolean" }).notNull().default(true),
  oneDay: integer("one_day", { mode: "boolean" }).notNull().default(true),
  twoHours: integer("two_hours", { mode: "boolean" }).notNull().default(false),
  includeDiet: integer("include_diet", { mode: "boolean" }).notNull().default(false),
  includeNote: integer("include_note", { mode: "boolean" }).notNull().default(false),
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

// Operational metadata only: this intentionally never stores a member's
// original chat message, LINE user ID, or any RSVP details.
export const lineCommandLogs = sqliteTable("line_command_logs", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  command: text("command").notNull(),
  outcome: text("outcome").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// LINE can redeliver a webhook when the original acknowledgement times out.
// Store only LINE's opaque event ID so a redelivery never sends a family the
// same reply or arrangement card twice.
export const lineWebhookDeliveries = sqliteTable("line_webhook_deliveries", {
  id: text("id").primaryKey(),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const mealTables = sqliteTable("meal_tables", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  capacity: integer("capacity").notNull().default(10),
  isReserve: integer("is_reserve", { mode: "boolean" }).notNull().default(false),
  note: text("note").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("meal_tables_event_sort_unique").on(table.eventId, table.sortOrder),
  uniqueIndex("meal_tables_event_name_key_unique").on(table.eventId, table.nameKey),
]);

export const mealAssignments = sqliteTable("meal_assignments", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  tableId: text("table_id").notNull().references(() => mealTables.id, { onDelete: "cascade" }),
  rsvpId: text("rsvp_id").notNull().references(() => rsvps.id, { onDelete: "cascade" }),
  people: integer("people").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("meal_assignments_table_rsvp_unique").on(table.tableId, table.rsvpId)]);

export const siteStats = sqliteTable("site_stats", {
  key: text("key").primaryKey(),
  views: integer("views").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// The initial operator code is a deployment secret. Once the operator changes
// it, only this deliberately slow, salted hash is retained in D1.
export const siteOperatorCredentials = sqliteTable("site_operator_credentials", {
  key: text("key").primaryKey(),
  codeHash: text("code_hash").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// This is intentionally a small, anonymous security trace: it never records
// the supplied code, client IP, user agent, event content, or any person.
export const siteOperatorAuditLogs = sqliteTable("site_operator_audit_logs", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  occurredAt: text("occurred_at").notNull(),
}, (table) => [index("site_operator_audit_logs_occurred_at").on(table.occurredAt)]);

// Aggregate-only status for trusted scheduled work. This never records
// activity details, attendees, groups, or message content.
export const schedulerHealth = sqliteTable("scheduler_health", {
  key: text("key").primaryKey(),
  lastSuccessAt: text("last_success_at").notNull().default(""),
  checkedEvents: integer("checked_events").notNull().default(0),
  closedEvents: integer("closed_events").notNull().default(0),
  sentReminders: integer("sent_reminders").notNull().default(0),
  purgedRecords: integer("purged_records").notNull().default(0),
});

// A bounded, aggregate-only audit trail for trusted scheduled work. It holds
// no activity title, attendee, LINE group, delivery content, or credential.
export const schedulerRuns = sqliteTable("scheduler_runs", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  runAt: text("run_at").notNull(),
  status: text("status").notNull(),
  stage: text("stage").notNull().default("completed"),
  checkedEvents: integer("checked_events").notNull().default(0),
  closedEvents: integer("closed_events").notNull().default(0),
  sentReminders: integer("sent_reminders").notNull().default(0),
  purgedRecords: integer("purged_records").notNull().default(0),
});

export const siteVisitWindows = sqliteTable("site_visit_windows", {
  fingerprint: text("fingerprint").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("site_visit_windows_expires_at").on(table.expiresAt)]);

export const fairyNotificationTargets = sqliteTable("fairy_notification_targets", {
  id: text("id").primaryKey(),
  lineUserId: text("line_user_id").notNull(),
  pairedAt: text("paired_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Memory Capsule is deliberately separate from event data. A LINE Login
// subject is immutable identity; its current display name and avatar are only
// the public profile values supplied by LINE and may be refreshed at login.
export const memoryFamilies = sqliteTable("memory_families", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  displayName: text("display_name").notNull(),
  // 20 GB is the initial family guardrail. R2 itself can grow beyond this,
  // but uploads stop here until a manager deliberately raises the quota.
  storageQuotaBytes: integer("storage_quota_bytes").notNull().default(20 * 1024 * 1024 * 1024),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("memory_families_slug_unique").on(table.slug)]);

export const memoryFamilyMembers = sqliteTable("memory_family_members", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => memoryFamilies.id, { onDelete: "cascade" }),
  lineSubject: text("line_subject").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url").notNull().default(""),
  role: text("role").notNull().default("member"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("memory_family_members_family_subject_unique").on(table.familyId, table.lineSubject),
  index("memory_family_members_subject_active").on(table.lineSubject, table.isActive),
]);

export const memoryFamilyInvites = sqliteTable("memory_family_invites", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => memoryFamilies.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  role: text("role").notNull().default("member"),
  maxUses: integer("max_uses").notNull().default(1),
  useCount: integer("use_count").notNull().default(0),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdByMemberId: text("created_by_member_id").notNull().references(() => memoryFamilyMembers.id, { onDelete: "restrict" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("memory_family_invites_code_hash_unique").on(table.codeHash),
  index("memory_family_invites_family_active").on(table.familyId, table.revokedAt, table.expiresAt),
]);

export const memoryCapsules = sqliteTable("memory_capsules", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => memoryFamilies.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  introduction: text("introduction").notNull().default(""),
  eraLabel: text("era_label").notNull().default(""),
  coverMediaId: text("cover_media_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
  createdByMemberId: text("created_by_member_id").notNull().references(() => memoryFamilyMembers.id, { onDelete: "restrict" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("memory_capsules_family_visible_sort").on(table.familyId, table.isArchived, table.sortOrder)]);

export const memoryMedia = sqliteTable("memory_media", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => memoryFamilies.id, { onDelete: "cascade" }),
  capsuleId: text("capsule_id").notNull().references(() => memoryCapsules.id, { onDelete: "cascade" }),
  authorMemberId: text("author_member_id").notNull().references(() => memoryFamilyMembers.id, { onDelete: "restrict" }),
  objectKey: text("object_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  capturedAt: text("captured_at"),
  uploadState: text("upload_state").notNull().default("pending"),
  uploadExpiresAt: text("upload_expires_at").notNull(),
  hiddenAt: text("hidden_at"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("memory_media_object_key_unique").on(table.objectKey),
  index("memory_media_capsule_visible_created").on(table.capsuleId, table.deletedAt, table.createdAt),
  index("memory_media_family_visible_created").on(table.familyId, table.deletedAt, table.createdAt),
]);

// Comments and reactions remain family-scoped even when they point at a
// capsule or an item of media. `displayAs` is optional and only represents
// the elder a member is speaking for; authorMemberId always records who acted.
export const memoryComments = sqliteTable("memory_comments", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => memoryFamilies.id, { onDelete: "cascade" }),
  capsuleId: text("capsule_id").references(() => memoryCapsules.id, { onDelete: "cascade" }),
  mediaId: text("media_id").references(() => memoryMedia.id, { onDelete: "cascade" }),
  authorMemberId: text("author_member_id").notNull().references(() => memoryFamilyMembers.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  displayAs: text("display_as").notNull().default(""),
  kind: text("kind").notNull().default("comment"),
  hiddenAt: text("hidden_at"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("memory_comments_family_visible_created").on(table.familyId, table.deletedAt, table.createdAt),
  index("memory_comments_media_visible_created").on(table.mediaId, table.deletedAt, table.createdAt),
  index("memory_comments_capsule_visible_created").on(table.capsuleId, table.deletedAt, table.createdAt),
]);

export const memoryReactions = sqliteTable("memory_reactions", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => memoryFamilies.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => memoryFamilyMembers.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  reaction: text("reaction").notNull().default("heart"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("memory_reactions_member_target_unique").on(table.memberId, table.targetType, table.targetId, table.reaction),
  index("memory_reactions_family_target").on(table.familyId, table.targetType, table.targetId),
]);

export const memoryReports = sqliteTable("memory_reports", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => memoryFamilies.id, { onDelete: "cascade" }),
  reporterMemberId: text("reporter_member_id").notNull().references(() => memoryFamilyMembers.id, { onDelete: "restrict" }),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"),
  resolvedByMemberId: text("resolved_by_member_id").references(() => memoryFamilyMembers.id, { onDelete: "restrict" }),
  resolvedAt: text("resolved_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("memory_reports_family_status_created").on(table.familyId, table.status, table.createdAt)]);

// This stores actor, action and opaque target identifiers only. Content is
// deliberately not copied into the audit log.
export const memoryAuditLogs = sqliteTable("memory_audit_logs", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => memoryFamilies.id, { onDelete: "cascade" }),
  actorMemberId: text("actor_member_id").references(() => memoryFamilyMembers.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("memory_audit_logs_family_created").on(table.familyId, table.createdAt)]);
