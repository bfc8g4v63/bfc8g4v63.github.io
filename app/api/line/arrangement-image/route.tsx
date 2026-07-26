import { ImageResponse } from "next/og";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureSchema } from "../../../../db/init";
import { events, mealAssignments, mealTables, rsvps } from "../../../../db/schema";
import { verifyActivityArrangementImage } from "../lib";

const PAGE_SIZE = 6;
const FONT_URL = "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/TC/NotoSansTC-Regular.otf";
let fontData: Promise<ArrayBuffer> | undefined;

type ArrangementTable = {
  id: string;
  name: string;
  capacity: number;
  isReserve: boolean;
  note: string;
};

type ArrangementAssignment = {
  tableId: string;
  rsvpId: string;
  people: number;
};

type ArrangementRsvp = {
  id: string;
  name: string;
  partySize: number;
};

function loadFont() {
  if (!fontData) {
    fontData = fetch(FONT_URL).then(async (response) => {
      if (!response.ok) throw new Error("Unable to load the Traditional Chinese font");
      return response.arrayBuffer();
    }).catch((error) => {
      fontData = undefined;
      throw error;
    });
  }
  return fontData;
}

function tableCards(tables: ArrangementTable[], assignments: ArrangementAssignment[], attendees: ArrangementRsvp[]) {
  const attendeeById = new Map(attendees.map((attendee) => [attendee.id, attendee]));
  const assignmentsByTable = new Map<string, ArrangementAssignment[]>();
  const assignedByRsvp = new Map<string, number>();
  for (const assignment of assignments) {
    if (!attendeeById.has(assignment.rsvpId)) continue;
    const values = assignmentsByTable.get(assignment.tableId) || [];
    values.push(assignment);
    assignmentsByTable.set(assignment.tableId, values);
    assignedByRsvp.set(assignment.rsvpId, (assignedByRsvp.get(assignment.rsvpId) || 0) + assignment.people);
  }

  const cards = tables.map((table) => {
    const entries = (assignmentsByTable.get(table.id) || []).flatMap((assignment) => {
      const attendee = attendeeById.get(assignment.rsvpId);
      return attendee ? [{ name: attendee.name, people: assignment.people }] : [];
    });
    return { table, entries, people: entries.reduce((sum, entry) => sum + entry.people, 0) };
  });
  const totalPeople = attendees.reduce((sum, attendee) => sum + attendee.partySize, 0);
  const assignedPeople = [...assignedByRsvp.values()].reduce((sum, people) => sum + people, 0);
  return { cards, totalPeople, assignedPeople, unassignedPeople: Math.max(0, totalPeople - assignedPeople) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("e") || "";
  const page = Number(url.searchParams.get("p"));
  const slot = Number(url.searchParams.get("t"));
  const signature = url.searchParams.get("h") || "";
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(eventId) || !Number.isInteger(page) || page < 0 || page > 3
    || !Number.isInteger(slot) || !await verifyActivityArrangementImage(eventId, page, slot, signature)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    await ensureSchema();
    const db = getDb();
    const [eventRows, tables, assignments, attendees] = await Promise.all([
      db.select({ title: events.title }).from(events).where(eq(events.id, eventId)).limit(1),
      db.select({ id: mealTables.id, name: mealTables.name, capacity: mealTables.capacity, isReserve: mealTables.isReserve, note: mealTables.note })
        .from(mealTables).where(eq(mealTables.eventId, eventId)).orderBy(asc(mealTables.sortOrder)),
      db.select({ tableId: mealAssignments.tableId, rsvpId: mealAssignments.rsvpId, people: mealAssignments.people })
        .from(mealAssignments).where(eq(mealAssignments.eventId, eventId)),
      db.select({ id: rsvps.id, name: rsvps.name, partySize: rsvps.partySize })
        .from(rsvps).where(and(eq(rsvps.eventId, eventId), eq(rsvps.response, "attending"))),
    ]);
    const [event] = eventRows;
    if (!event || !tables.length || page >= Math.ceil(tables.length / PAGE_SIZE)) return new Response("Not found", { status: 404 });

    const arrangement = tableCards(tables, assignments, attendees);
    const pageCards = arrangement.cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const rowHeights = Array.from({ length: Math.ceil(pageCards.length / 2) }, (_, row) => {
      const cards = pageCards.slice(row * 2, row * 2 + 2);
      return Math.max(...cards.map((card) => 220 + Math.min(card.entries.length, 6) * 42 + (card.entries.length > 6 ? 34 : 0)));
    });
    const height = 210 + rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0) + Math.max(0, rowHeights.length - 1) * 22 + 42;
    const font = await loadFont();

    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: "#fffaf0", color: "#163f3b", padding: 34, fontFamily: "Noto Sans TC" }}>
        <div style={{ display: "flex", flexDirection: "column", borderBottom: "3px solid #efc36e", paddingBottom: 22, marginBottom: 20 }}>
          <div style={{ display: "flex", color: "#cf5943", fontSize: 23, fontWeight: 700 }}>好日子・活動安排</div>
          <div style={{ display: "flex", fontSize: 42, fontWeight: 700, marginTop: 6 }}>{event.title}</div>
          <div style={{ display: "flex", fontSize: 23, marginTop: 10, color: "#58706d" }}>已安排 {arrangement.assignedPeople} 人　・　尚未安排 {arrangement.unassignedPeople} 人</div>
        </div>
        <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 22 }}>
          {pageCards.map((card, index) => {
            const remaining = card.table.capacity - card.people;
            const visibleEntries = card.entries.slice(0, 6);
            return <div key={card.table.id} style={{ width: 475, minHeight: rowHeights[Math.floor(index / 2)], display: "flex", flexDirection: "column", border: "2px solid #bd7623", borderRadius: 18, padding: 22, backgroundColor: "#fffdf8" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", fontSize: 28, fontWeight: 700 }}>{card.table.name}{card.table.isReserve ? "・預備區" : ""}</div>
                <div style={{ display: "flex", fontSize: 21, color: "#6a7a75" }}>上限 {card.table.capacity}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: 12, padding: "14px 16px", marginTop: 16, backgroundColor: "#fff3d2" }}>
                <div style={{ display: "flex", fontSize: 33, fontWeight: 700, color: "#d85236" }}>{card.people} / {card.table.capacity}</div>
                <div style={{ display: "flex", fontSize: 20, color: "#58706d" }}>{remaining <= 0 ? "已滿" : `尚有 ${remaining} 位`}</div>
              </div>
              {card.table.note ? <div style={{ display: "flex", fontSize: 20, color: "#58706d", marginTop: 14 }}>位置／分組：{card.table.note}</div> : null}
              <div style={{ display: "flex", flexDirection: "column", marginTop: 14, gap: 8 }}>
                {visibleEntries.length ? visibleEntries.map((entry, entryIndex) => <div key={`${entry.name}-${entryIndex}`} style={{ display: "flex", justifyContent: "space-between", borderRadius: 10, padding: "10px 14px", backgroundColor: "#e9f5ec", fontSize: 22 }}><span>{entry.name}</span><span>{entry.people} 人</span></div>) : <div style={{ display: "flex", fontSize: 22, color: "#7b8984" }}>尚未安排</div>}
                {card.entries.length > visibleEntries.length ? <div style={{ display: "flex", fontSize: 20, color: "#58706d" }}>另有 {card.entries.length - visibleEntries.length} 筆安排</div> : null}
              </div>
            </div>;
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, color: "#58706d", fontSize: 19 }}><span>由好日子小幫手整理</span><span>{page + 1} / {Math.ceil(tables.length / PAGE_SIZE)} 頁</span></div>
      </div>,
      {
        width: 1040,
        height,
        fonts: [{ name: "Noto Sans TC", data: font, weight: 400, style: "normal" }],
        headers: { "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
      },
    );
  } catch (error) {
    console.error("LINE arrangement image failed", error);
    return new Response("Unable to create arrangement image", { status: 500 });
  }
}
