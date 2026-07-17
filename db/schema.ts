import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  eventDate: text("event_date").notNull(),
  startTime: text("start_time").notNull(),
  location: text("location").notNull(),
  description: text("description").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  capacity: integer("capacity"),
  status: text("status").notNull().default("active"),
  editCodeHash: text("edit_code_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const rsvps = sqliteTable("rsvps", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  partySize: integer("party_size").notNull().default(1),
  diet: text("diet").notNull().default(""),
  note: text("note").notNull().default(""),
  response: text("response").notNull().default("attending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("rsvps_event_name_unique").on(table.eventId, table.name)]);
