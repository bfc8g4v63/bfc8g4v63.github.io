import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { mealAssignments, mealTables } from "../db/schema";
import { firstWholePartyTable } from "./meal-auto-fill-rules";

/** Adds only the newly attending RSVP. Existing placements are never moved. */
export async function autoFillWholeParty(eventId: string, rsvpId: string, partySize: number) {
  if (!Number.isInteger(partySize) || partySize < 1) return false;
  const db = getDb();
  const [tables, assignments] = await Promise.all([
    db.select({ id: mealTables.id, capacity: mealTables.capacity, isReserve: mealTables.isReserve, sortOrder: mealTables.sortOrder })
      .from(mealTables).where(eq(mealTables.eventId, eventId)).orderBy(asc(mealTables.sortOrder)),
    db.select({ tableId: mealAssignments.tableId, people: mealAssignments.people })
      .from(mealAssignments).where(eq(mealAssignments.eventId, eventId)),
  ]);
  const table = firstWholePartyTable(tables, assignments, partySize);
  if (!table) return false;
  await db.insert(mealAssignments).values({
    id: crypto.randomUUID(), eventId, tableId: table.id, rsvpId, people: partySize,
    updatedAt: new Date().toISOString(),
  });
  return true;
}
