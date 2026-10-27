export type MealTableCandidate = { id: string; capacity: number; isReserve: boolean; sortOrder: number };
export type MealAssignmentUsage = { tableId: string; people: number };

/** Never split a household: a party is eligible only when one non-reserve area
 * has enough whole remaining capacity. */
export function firstWholePartyTable(
  tables: MealTableCandidate[],
  assignments: MealAssignmentUsage[],
  partySize: number,
) {
  const usedByTable = new Map<string, number>();
  for (const assignment of assignments) {
    usedByTable.set(assignment.tableId, (usedByTable.get(assignment.tableId) || 0) + assignment.people);
  }
  return [...tables]
    .filter((table) => !table.isReserve)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .find((table) => partySize <= table.capacity - (usedByTable.get(table.id) || 0));
}
