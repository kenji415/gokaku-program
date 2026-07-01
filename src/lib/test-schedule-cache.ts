import { getDb } from "./db";
import * as schema from "./db/schema";

export type CachedTestSchedule = typeof schema.testSchedules.$inferSelect;

let cachedRows: CachedTestSchedule[] | null = null;

export function getCachedTestSchedules(): CachedTestSchedule[] {
  if (!cachedRows) {
    cachedRows = getDb().select().from(schema.testSchedules).all();
  }
  return cachedRows;
}

export function invalidateTestScheduleCache(): void {
  cachedRows = null;
}
