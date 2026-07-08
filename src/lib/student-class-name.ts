import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./db/schema";
import { eventDateSortRank } from "./test-schedule-utils";

type StudentClassRow = {
  id: string;
  className: string | null;
  classNameLocked: number | boolean | null;
};

export function isStudentClassNameLocked(
  locked: number | boolean | null | undefined,
): boolean {
  return locked === 1 || locked === true;
}

/** 成績の新クラス欄から、開催日が最も新しい値を返す */
export function getLatestNewClassFromResults(studentId: string): string | null {
  const db = getDb();
  const resultRows = db
    .select()
    .from(schema.studentTestResults)
    .where(eq(schema.studentTestResults.studentId, studentId))
    .all();

  const withClass = resultRows
    .map((row) => ({
      testScheduleId: row.testScheduleId,
      newClass: row.newClass?.trim() ?? "",
      updatedAt: row.updatedAt,
    }))
    .filter((row) => row.newClass !== "");

  if (withClass.length === 0) return null;

  const testIds = withClass.map((row) => row.testScheduleId);
  const tests = db
    .select()
    .from(schema.testSchedules)
    .where(inArray(schema.testSchedules.id, testIds))
    .all();
  const testMap = new Map(tests.map((test) => [test.id, test]));

  const latest = withClass
    .map((row) => {
      const test = testMap.get(row.testScheduleId);
      return {
        newClass: row.newClass,
        sortRank: eventDateSortRank(test?.testDate, test?.yearMonth),
        updatedAt: row.updatedAt,
      };
    })
    .sort((a, b) => {
      if (b.sortRank !== a.sortRank) return b.sortRank - a.sortRank;
      return b.updatedAt.localeCompare(a.updatedAt);
    })[0];

  return latest?.newClass ?? null;
}

export function resolveStudentClassName(student: StudentClassRow): string {
  if (isStudentClassNameLocked(student.classNameLocked)) {
    return student.className?.trim() ?? "";
  }

  const latest = getLatestNewClassFromResults(student.id);
  if (latest) return latest;
  return student.className?.trim() ?? "";
}

/** 手動ロック中でなければ、成績の最新新クラスを students.class_name に反映 */
export function syncStudentClassNameFromResults(studentId: string): string {
  const db = getDb();
  const student = db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, studentId))
    .get();
  if (!student || isStudentClassNameLocked(student.classNameLocked)) {
    return resolveStudentClassName(
      student ?? { id: studentId, className: null, classNameLocked: 0 },
    );
  }

  const resolved = resolveStudentClassName(student);
  if (resolved !== (student.className?.trim() ?? "")) {
    db.update(schema.students)
      .set({ className: resolved || null })
      .where(eq(schema.students.id, studentId))
      .run();
  }
  return resolved;
}

/** 成績保存時: 新クラスがあればクラス欄を更新し、手動ロックを解除 */
export function applyStudentClassNameFromTestResult(
  studentId: string,
  newClass: string,
) {
  const trimmed = newClass.trim();
  if (!trimmed) return;

  const db = getDb();
  db.update(schema.students)
    .set({
      className: trimmed,
      classNameLocked: 0,
    })
    .where(eq(schema.students.id, studentId))
    .run();
}
