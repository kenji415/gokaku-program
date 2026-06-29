import { eq } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./db/schema";

export function getTeacherDefaultCampus(teacherId: string): string {
  const db = getDb();
  const user = db
    .select({ defaultCampus: schema.users.defaultCampus })
    .from(schema.users)
    .where(eq(schema.users.id, teacherId))
    .get();
  return user?.defaultCampus?.trim() ?? "";
}

export function updateTeacherDefaultCampus(
  teacherId: string,
  defaultCampus: string,
): void {
  const db = getDb();
  db.update(schema.users)
    .set({ defaultCampus: defaultCampus.trim() || null })
    .where(eq(schema.users.id, teacherId))
    .run();
}
