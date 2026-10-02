import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { activityLineGroups, lineBindings } from "../../../db/schema";

export type NotificationGroup = { groupId: string; groupName: string };

export async function eventNotificationGroups(eventId: string): Promise<NotificationGroup[]> {
  const db = getDb();
  const [[legacy], selected] = await Promise.all([
    db.select({ groupId: lineBindings.groupId, groupName: lineBindings.groupName })
      .from(lineBindings).where(eq(lineBindings.eventId, eventId)).limit(1),
    db.select({ groupId: activityLineGroups.groupId, groupName: activityLineGroups.groupName })
      .from(activityLineGroups).where(eq(activityLineGroups.eventId, eventId)),
  ]);
  const groups = new Map<string, NotificationGroup>();
  if (legacy) groups.set(legacy.groupId, legacy);
  for (const group of selected) groups.set(group.groupId, group);
  return [...groups.values()];
}
