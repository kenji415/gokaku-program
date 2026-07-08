import { and, eq, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import * as schema from "./db/schema";
import {
  EMPTY_TEST_RESULT,
  hasScoreResult,
  parseExtraScores,
  serializeExtraScores,
  type StudentTestResultInput,
} from "./test-result-types";
import {
  applyStudentClassNameFromTestResult,
} from "./student-class-name";
import {
  eventDateSortRank,
  formatTestScheduleDisplayText,
} from "./test-schedule-utils";

export type { StudentTestResultInput };
export { EMPTY_TEST_RESULT };

export type RecentTestResult = {
  testScheduleId: string;
  displayText: string;
  result: StudentTestResultInput;
};

export type StudentTestResultHistoryItem = {
  testScheduleId: string;
  testDate: string;
  cramSchool: string;
  testName: string;
  displayText: string;
  result: StudentTestResultInput;
  sortRank: number;
};

function rowToInput(
  row: typeof schema.studentTestResults.$inferSelect,
): StudentTestResultInput {
  return {
    deviation: row.deviation ?? "",
    fourSubjects: row.fourSubjects ?? "",
    math: row.math ?? "",
    japanese: row.japanese ?? "",
    science: row.science ?? "",
    social: row.social ?? "",
    newClass: row.newClass ?? "",
    notes: row.notes ?? "",
    extraScores: parseExtraScores(row.extraScores),
  };
}

function hasAnyValue(input: StudentTestResultInput): boolean {
  return (
    hasScoreResult(input) ||
    input.newClass?.trim() !== "" ||
    input.notes.trim() !== "" ||
    (input.extraScores ?? []).some(
      (row) => row.label.trim() !== "" || row.value.trim() !== "",
    )
  );
}

export function getStudentTestResultsForIds(
  studentId: string,
  testScheduleIds: string[],
): Map<string, StudentTestResultInput> {
  const result = new Map<string, StudentTestResultInput>();
  if (testScheduleIds.length === 0) return result;

  const db = getDb();
  const rows = db
    .select()
    .from(schema.studentTestResults)
    .where(
      and(
        eq(schema.studentTestResults.studentId, studentId),
        inArray(schema.studentTestResults.testScheduleId, testScheduleIds),
      ),
    )
    .all();

  for (const row of rows) {
    result.set(row.testScheduleId, rowToInput(row));
  }
  return result;
}

export function getStudentTestResults(
  studentId: string,
): Map<string, StudentTestResultInput> {
  const db = getDb();
  const rows = db
    .select()
    .from(schema.studentTestResults)
    .where(eq(schema.studentTestResults.studentId, studentId))
    .all();

  const result = new Map<string, StudentTestResultInput>();
  for (const row of rows) {
    result.set(row.testScheduleId, rowToInput(row));
  }
  return result;
}

export function saveStudentTestResult(
  studentId: string,
  testScheduleId: string,
  input: StudentTestResultInput,
) {
  const db = getDb();
  const now = new Date().toISOString();
  const normalized: StudentTestResultInput = {
    deviation: input.deviation.trim(),
    fourSubjects: input.fourSubjects.trim(),
    math: input.math.trim(),
    japanese: input.japanese.trim(),
    science: input.science.trim(),
    social: input.social.trim(),
    newClass: (input.newClass ?? "").trim(),
    notes: input.notes.trim(),
    extraScores: (input.extraScores ?? []).map((row) => ({
      label: row.label.trim(),
      value: row.value.trim(),
    })),
  };
  const extraScoresJson = serializeExtraScores(normalized.extraScores);

  const existing = db
    .select()
    .from(schema.studentTestResults)
    .where(
      and(
        eq(schema.studentTestResults.studentId, studentId),
        eq(schema.studentTestResults.testScheduleId, testScheduleId),
      ),
    )
    .get();

  if (!hasAnyValue(normalized)) {
    if (existing) {
      db.delete(schema.studentTestResults)
        .where(eq(schema.studentTestResults.id, existing.id))
        .run();
    }
    return null;
  }

  if (existing) {
    db.update(schema.studentTestResults)
      .set({
        deviation: normalized.deviation,
        fourSubjects: normalized.fourSubjects,
        math: normalized.math,
        japanese: normalized.japanese,
        science: normalized.science,
        social: normalized.social,
        newClass: normalized.newClass,
        notes: normalized.notes,
        extraScores: extraScoresJson || null,
        updatedAt: now,
      })
      .where(eq(schema.studentTestResults.id, existing.id))
      .run();
    if (normalized.newClass) {
      applyStudentClassNameFromTestResult(studentId, normalized.newClass);
    }
    return existing.id;
  }

  const id = uuid();
  db.insert(schema.studentTestResults)
    .values({
      id,
      studentId,
      testScheduleId,
      deviation: normalized.deviation,
      fourSubjects: normalized.fourSubjects,
      math: normalized.math,
      japanese: normalized.japanese,
      science: normalized.science,
      social: normalized.social,
      newClass: normalized.newClass,
      notes: normalized.notes,
      extraScores: extraScoresJson || null,
      updatedAt: now,
    })
    .run();
  if (normalized.newClass) {
    applyStudentClassNameFromTestResult(studentId, normalized.newClass);
  }
  return id;
}

export function teacherCanAccessStudent(
  teacherId: string,
  studentId: string,
): boolean {
  const db = getDb();
  const row = db
    .select({ id: schema.studentAssignments.id })
    .from(schema.studentAssignments)
    .where(
      and(
        eq(schema.studentAssignments.teacherId, teacherId),
        eq(schema.studentAssignments.studentId, studentId),
      ),
    )
    .get();
  return Boolean(row);
}

export function getStudentTestResultHistory(
  studentId: string,
): StudentTestResultHistoryItem[] {
  const db = getDb();
  const resultRows = db
    .select()
    .from(schema.studentTestResults)
    .where(eq(schema.studentTestResults.studentId, studentId))
    .all();

  const scored = resultRows
    .map((row) => ({
      testScheduleId: row.testScheduleId,
      result: rowToInput(row),
    }))
    .filter((item) => hasAnyValue(item.result));

  if (scored.length === 0) return [];

  const testIds = scored.map((item) => item.testScheduleId);
  const tests = db
    .select()
    .from(schema.testSchedules)
    .where(inArray(schema.testSchedules.id, testIds))
    .all();
  const testMap = new Map(tests.map((test) => [test.id, test]));

  return scored
    .map((item) => {
      const test = testMap.get(item.testScheduleId);
      if (!test) return null;
      const sortRank = eventDateSortRank(test.testDate, test.yearMonth);
      return {
        testScheduleId: item.testScheduleId,
        testDate: test.testDate?.trim() || test.yearMonth,
        cramSchool: test.cramSchool?.trim() || "",
        testName: test.testName,
        displayText: formatTestScheduleDisplayText(test),
        result: item.result,
        sortRank,
      };
    })
    .filter((item): item is StudentTestResultHistoryItem => item != null)
    .sort((a, b) => b.sortRank - a.sortRank);
}

export function getRecentStudentTestResults(
  studentId: string,
  limit = 2,
): RecentTestResult[] {
  const db = getDb();
  const resultRows = db
    .select()
    .from(schema.studentTestResults)
    .where(eq(schema.studentTestResults.studentId, studentId))
    .all();

  const scored = resultRows
    .map((row) => ({
      testScheduleId: row.testScheduleId,
      result: rowToInput(row),
    }))
    .filter((item) => hasScoreResult(item.result));

  if (scored.length === 0) return [];

  const testIds = scored.map((item) => item.testScheduleId);
  const tests = db
    .select()
    .from(schema.testSchedules)
    .where(inArray(schema.testSchedules.id, testIds))
    .all();
  const testMap = new Map(tests.map((test) => [test.id, test]));

  return scored
    .map((item) => {
      const test = testMap.get(item.testScheduleId);
      if (!test || !formatTestScheduleDisplayText(test)) return null;
      return {
        testScheduleId: item.testScheduleId,
        displayText: formatTestScheduleDisplayText(test),
        result: item.result,
        sortRank: eventDateSortRank(test.testDate, test.yearMonth),
      };
    })
    .filter((item): item is RecentTestResult & { sortRank: number } => item != null)
    .sort((a, b) => b.sortRank - a.sortRank)
    .slice(0, limit)
    .map(({ testScheduleId, displayText, result }) => ({
      testScheduleId,
      displayText,
      result,
    }));
}
