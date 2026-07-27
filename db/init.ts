import { env } from "cloudflare:workers";
import { arrangementNameKey } from "../lib/arrangement";

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
        include_diet INTEGER NOT NULL DEFAULT 0,
        include_note INTEGER NOT NULL DEFAULT 0,
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
      database.prepare(`CREATE TABLE IF NOT EXISTS meal_tables (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 10,
        is_reserve INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )`),
      database.prepare(`CREATE TABLE IF NOT EXISTS meal_assignments (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        table_id TEXT NOT NULL,
        rsvp_id TEXT NOT NULL,
        people INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (table_id) REFERENCES meal_tables(id) ON DELETE CASCADE,
        FOREIGN KEY (rsvp_id) REFERENCES rsvps(id) ON DELETE CASCADE
      )`),
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS meal_assignments_table_rsvp_unique ON meal_assignments (table_id, rsvp_id)"),
      database.prepare(`CREATE TABLE IF NOT EXISTS site_stats (
        key TEXT PRIMARY KEY NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      database.prepare(`CREATE TABLE IF NOT EXISTS api_rate_limits (
        key TEXT PRIMARY KEY NOT NULL,
        count INTEGER NOT NULL,
        reset_at INTEGER NOT NULL
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
    const mealTableColumns = await database.prepare("PRAGMA table_info(meal_tables)").all<{ name: string }>();
    const mealTableNames = new Set((mealTableColumns.results || []).map((column) => column.name));
    if (!mealTableNames.has("name_key")) {
      await database.prepare("ALTER TABLE meal_tables ADD COLUMN name_key TEXT NOT NULL DEFAULT ''").run();
    }
    const missingTableNameKeys = await database.prepare("SELECT COUNT(*) AS count FROM meal_tables WHERE name_key = '' OR name_key IS NULL").first<{ count: number }>();
    if (missingTableNameKeys?.count) {
      const savedTables = await database.prepare("SELECT id, event_id, name, name_key FROM meal_tables").all<{
        id: string; event_id: string; name: string; name_key: string;
      }>();
      const usedNameKeys = new Set<string>();
      const tableNameUpdates: D1PreparedStatement[] = [];
      for (const table of savedTables.results || []) {
        const baseKey = arrangementNameKey(table.name) || `legacy-${table.id}`;
        const scopeKey = `${table.event_id}:${baseKey}`;
        const nameKey = usedNameKeys.has(scopeKey) ? `${baseKey}--legacy-${table.id}` : baseKey;
        usedNameKeys.add(`${table.event_id}:${nameKey}`);
        if (table.name_key !== nameKey) {
          tableNameUpdates.push(database.prepare("UPDATE meal_tables SET name_key = ? WHERE id = ?").bind(nameKey, table.id));
        }
      }
      if (tableNameUpdates.length) await database.batch(tableNameUpdates);
    }
    const settingColumns = await database.prepare("PRAGMA table_info(line_reminder_settings)").all<{ name: string }>();
    const settingNames = new Set((settingColumns.results || []).map((column) => column.name));
    const hasLegacyRsvpDetails = settingNames.has("include_rsvp_details");
    if (!settingNames.has("include_diet")) {
      await database.prepare("ALTER TABLE line_reminder_settings ADD COLUMN include_diet INTEGER NOT NULL DEFAULT 0").run();
      if (hasLegacyRsvpDetails) {
        await database.prepare("UPDATE line_reminder_settings SET include_diet = include_rsvp_details WHERE include_rsvp_details = 1").run();
      }
    }
    if (!settingNames.has("include_note")) {
      await database.prepare("ALTER TABLE line_reminder_settings ADD COLUMN include_note INTEGER NOT NULL DEFAULT 0").run();
      if (hasLegacyRsvpDetails) {
        await database.prepare("UPDATE line_reminder_settings SET include_note = include_rsvp_details WHERE include_rsvp_details = 1").run();
      }
    }
    await database.prepare("UPDATE events SET share_token = lower(hex(randomblob(16))) WHERE share_token = '' OR share_token IS NULL").run();
    await database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS events_share_token_unique ON events (share_token)").run();
    await database.batch([
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS meal_tables_event_sort_unique ON meal_tables (event_id, sort_order)"),
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS meal_tables_event_name_key_unique ON meal_tables (event_id, name_key)"),
    ]);
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
