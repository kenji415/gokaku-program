import { and, asc, eq } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./db/schema";

/** 科目担当をスロット順（1=左 → 2=右）で連名表示 */
export function formatSubjectTeacherNames(
  studentId: string,
  subject: string,
  fallbackName = "",
): string {
  const db = getDb();
  const rows = db
    .select({
      name: schema.users.name,
      slot: schema.studentAssignments.slot,
    })
    .from(schema.studentAssignments)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.studentAssignments.teacherId),
    )
    .where(
      and(
        eq(schema.studentAssignments.studentId, studentId),
        eq(schema.studentAssignments.subject, subject),
      ),
    )
    .orderBy(asc(schema.studentAssignments.slot))
    .all();

  const names = rows.map((row) => row.name.trim()).filter(Boolean);
  if (names.length === 0) return fallbackName;
  // Set は挿入順を保つので slot 順のまま連名になる
  return [...new Set(names)].join("　");
}
