import { env } from "cloudflare:workers";

let ready: Promise<void> | null = null;

export function ensureSchema() {
  if (ready) return ready;
  ready = (async () => {
    const database = (env as unknown as { DB?: D1Database }).DB;
    if (!database) throw new Error("活動資料庫尚未連線");
    await database.batch([
      database.prepare(`CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        event_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        creator_name TEXT NOT NULL DEFAULT '',
        contact_name TEXT NOT NULL DEFAULT '',
        contact_phone TEXT NOT NULL DEFAULT '',
        capacity INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        access_mode TEXT NOT NULL DEFAULT 'unlisted',
        attendance_visibility TEXT NOT NULL DEFAULT 'count',
        share_token TEXT NOT NULL DEFAULT '',
        participant_code_hash TEXT NOT NULL DEFAULT '',
        edit_code_hash TEXT NOT NULL,
        manager_token_hash TEXT NOT NULL DEFAULT '',
        cancelled_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      database.prepare(`CREATE TABLE IF NOT EXISTS rsvps (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        name TEXT NOT NULL,
        party_size INTEGER NOT NULL DEFAULT 1,
        diet TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        response TEXT NOT NULL DEFAULT 'attending',
        share_name INTEGER NOT NULL DEFAULT 0,
        viewer_token_hash TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )`),
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS rsvps_event_name_unique ON rsvps (event_id, name)"),
      database.prepare(`CREATE TABLE IF NOT EXISTS line_bindings (
        event_id TEXT PRIMARY KEY NOT NULL,
        group_id TEXT NOT NULL,
        group_name TEXT NOT NULL DEFAULT 'LINE 群組',
        bound_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )`),
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS line_bindings_group_unique ON line_bindings (group_id)"),
      database.prepare(`CREATE TABLE IF NOT EXISTS line_bind_codes (
        code TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )`),
      database.prepare(`CREATE TABLE IF NOT EXISTS line_reminder_settings (
        event_id TEXT PRIMARY KEY NOT NULL,
        seven_days INTEGER NOT NULL DEFAULT 1,
        one_day INTEGER NOT NULL DEFAULT 1,
        two_hours INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )`),
      database.prepare(`CREATE TABLE IF NOT EXISTS line_reminder_deliveries (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        reminder_key TEXT NOT NULL,
        event_fingerprint TEXT NOT NULL,
        sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )`),
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS line_reminder_delivery_unique ON line_reminder_deliveries (event_id, reminder_key, event_fingerprint)"),
      database.prepare(`CREATE TABLE IF NOT EXISTS site_stats (
        key TEXT PRIMARY KEY NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
    ]);
    const columns = await database.prepare("PRAGMA table_info(events)").all<{ name: string }>();
    const names = new Set((columns.results || []).map((column) => column.name));
    if (!names.has("access_mode")) {
      // Preserve the visibility of activities created before privacy modes existed.
      await database.prepare("ALTER TABLE events ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'public'").run();
    }
    if (!names.has("share_token")) {
      await database.prepare("ALTER TABLE events ADD COLUMN share_token TEXT NOT NULL DEFAULT ''").run();
    }
    if (!names.has("participant_code_hash")) {
      await database.prepare("ALTER TABLE events ADD COLUMN participant_code_hash TEXT NOT NULL DEFAULT ''").run();
    }
    if (!names.has("creator_name")) {
      await database.prepare("ALTER TABLE events ADD COLUMN creator_name TEXT NOT NULL DEFAULT ''").run();
    }
    if (!names.has("attendance_visibility")) {
      await database.prepare("ALTER TABLE events ADD COLUMN attendance_visibility TEXT NOT NULL DEFAULT 'count'").run();
    }
    if (!names.has("manager_token_hash")) {
      await database.prepare("ALTER TABLE events ADD COLUMN manager_token_hash TEXT NOT NULL DEFAULT ''").run();
    }
    if (!names.has("cancelled_at")) {
      await database.prepare("ALTER TABLE events ADD COLUMN cancelled_at TEXT").run();
    }
    const rsvpColumns = await database.prepare("PRAGMA table_info(rsvps)").all<{ name: string }>();
    const rsvpNames = new Set((rsvpColumns.results || []).map((column) => column.name));
    if (!rsvpNames.has("share_name")) {
      await database.prepare("ALTER TABLE rsvps ADD COLUMN share_name INTEGER NOT NULL DEFAULT 0").run();
    }
    if (!rsvpNames.has("viewer_token_hash")) {
      await database.prepare("ALTER TABLE rsvps ADD COLUMN viewer_token_hash TEXT NOT NULL DEFAULT ''").run();
    }
    await database.prepare("UPDATE events SET share_token = lower(hex(randomblob(16))) WHERE share_token = '' OR share_token IS NULL").run();
    await database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS events_share_token_unique ON events (share_token)").run();
    await database.batch([
      database.prepare("DROP TRIGGER IF EXISTS rsvps_capacity_before_insert"),
      database.prepare("DROP TRIGGER IF EXISTS rsvps_capacity_before_update"),
      database.prepare(`CREATE TRIGGER rsvps_capacity_before_insert
        BEFORE INSERT ON rsvps
        WHEN NEW.response = 'attending'
          AND EXISTS (
            SELECT 1 FROM events
            WHERE id = NEW.event_id
              AND capacity IS NOT NULL
              AND COALESCE((
                SELECT SUM(party_size) FROM rsvps
                WHERE event_id = NEW.event_id AND response = 'attending'
              ), 0) + NEW.party_size > capacity
          )
        BEGIN
          SELECT RAISE(ABORT, 'capacity_exceeded');
        END`),
      database.prepare(`CREATE TRIGGER rsvps_capacity_before_update
        BEFORE UPDATE OF party_size, response ON rsvps
        WHEN NEW.response = 'attending'
          AND EXISTS (
            SELECT 1 FROM events
            WHERE id = NEW.event_id
              AND capacity IS NOT NULL
              AND NEW.party_size > CASE WHEN OLD.response = 'attending' THEN OLD.party_size ELSE 0 END
              AND COALESCE((
                SELECT SUM(party_size) FROM rsvps
                WHERE event_id = NEW.event_id AND response = 'attending'
              ), 0)
                - CASE WHEN OLD.response = 'attending' THEN OLD.party_size ELSE 0 END
                + NEW.party_size > capacity
          )
        BEGIN
          SELECT RAISE(ABORT, 'capacity_exceeded');
        END`),
    ]);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}
