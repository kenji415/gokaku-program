import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./db/schema";
import { eventDateSortRank } from "./test-schedule-utils";

type StudentClassRow = {
  id: string;
  className: string | null;
  classNameLocked: number | boolean | null;
};

export type LatestNewClassInfo = {
  newClass: string;
  testScheduleId: string;
  sortRank: number;
};

export function isStudentClassNameLocked(
  locked: number | boolean | null | undefined,
): boolean {
  return locked === 1 || locked === true;
}

/** 成績の新クラス欄から、模試日付が最も新しいものを返す（入力日ではない） */
export function getLatestNewClassInfo(
  studentId: string,
): LatestNewClassInfo | null {
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
        testScheduleId: row.testScheduleId,
        sortRank: eventDateSortRank(test?.testDate, test?.yearMonth),
        updatedAt: row.updatedAt,
      };
    })
    .sort((a, b) => {
      if (b.sortRank !== a.sortRank) return b.sortRank - a.sortRank;
      return b.updatedAt.localeCompare(a.updatedAt);
    })[0];

  if (!latest) return null;
  return {
    newClass: latest.newClass,
    testScheduleId: latest.testScheduleId,
    sortRank: latest.sortRank,
  };
}

/** 成績の新クラス欄から、開催日が最も新しい値を返す */
export function getLatestNewClassFromResults(studentId: string): string | null {
  return getLatestNewClassInfo(studentId)?.newClass ?? null;
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

/**
 * 成績の新クラス保存時の基本情報クラス更新。
 * - 未ロック: 模試日付が最新の新クラスを反映
 * - 手入力ロック中: 今回の模試が（模試日付で）最新のときだけ解除して反映
 */
export function applyStudentClassNameFromTestResult(
  studentId: string,
  newClass: string,
  testScheduleId: string,
): string {
  const db = getDb();
  const student = db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, studentId))
    .get();
  if (!student) return "";

  const trimmed = newClass.trim();
  if (!trimmed) {
    return syncStudentClassNameFromResults(studentId);
  }

  const test = db
    .select()
    .from(schema.testSchedules)
    .where(eq(schema.testSchedules.id, testScheduleId))
    .get();
  const thisRank = eventDateSortRank(test?.testDate, test?.yearMonth);
  const latest = getLatestNewClassInfo(studentId);

  if (isStudentClassNameLocked(student.classNameLocked)) {
    // 手入力は、より新しい（または同日最新の）模試のクラス結果が入るまで維持
    if (!latest || thisRank < latest.sortRank) {
      return student.className?.trim() ?? "";
    }
  }

  const nextClass = latest?.newClass ?? trimmed;
  db.update(schema.students)
    .set({
      className: nextClass || null,
      classNameLocked: 0,
    })
    .where(eq(schema.students.id, studentId))
    .run();
  return nextClass;
}
