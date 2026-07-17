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
        contact_name TEXT NOT NULL DEFAULT '',
        contact_phone TEXT NOT NULL DEFAULT '',
        capacity INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        edit_code_hash TEXT NOT NULL,
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
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )`),
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS rsvps_event_name_unique ON rsvps (event_id, name)"),
    ]);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}
