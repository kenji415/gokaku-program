import { and, eq, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import * as schema from "./db/schema";
import type { SpreadsheetRow } from "./test-schedule-utils";
import { isRowEmpty, sortTestScheduleRows, testBelongsToYearMonth } from "./test-schedule-utils";
import { invalidateTestScheduleCache } from "./test-schedule-cache";

export type TestScheduleInput = {
  cramSchool?: string;
  grade: string;
  testName: string;
  testDate?: string;
  displayText: string;
  yearMonth: string;
  inTestCourse?: boolean;
};

function rowInTestCourse(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}

type DbTx = ReturnType<typeof getDb>;

function pruneMisplacedStudentMonthTests(
  tx: DbTx,
  testScheduleId: string,
  test: { testDate: string | null; yearMonth: string; grade: string },
) {
  const links = tx
    .select({
      id: schema.studentMonthTests.id,
      studentId: schema.studentMonthTests.studentId,
      yearMonth: schema.studentMonthTests.yearMonth,
    })
    .from(schema.studentMonthTests)
    .where(eq(schema.studentMonthTests.testScheduleId, testScheduleId))
    .all();

  if (links.length === 0) return;

  const studentIds = [...new Set(links.map((link) => link.studentId))];
  const students =
    studentIds.length === 0
      ? []
      : tx
          .select({
            id: schema.students.id,
            grade: schema.students.grade,
          })
          .from(schema.students)
          .where(
            studentIds.length === 1
              ? eq(schema.students.id, studentIds[0])
              : inArray(schema.students.id, studentIds),
          )
          .all();
  const gradeByStudent = new Map(
    students.map((row) => [row.id, row.grade?.trim() ?? ""]),
  );
  const testGrade = test.grade.trim();

  for (const link of links) {
    const wrongMonth = !testBelongsToYearMonth(test, link.yearMonth);
    const studentGrade = gradeByStudent.get(link.studentId) ?? "";
    const wrongGrade =
      Boolean(studentGrade) &&
      Boolean(testGrade) &&
      studentGrade !== testGrade;
    if (wrongMonth || wrongGrade) {
      tx.delete(schema.studentMonthTests)
        .where(eq(schema.studentMonthTests.id, link.id))
        .run();
    }
  }
}

export function listTestSchedules() {
  const db = getDb();
  const rows = db.select().from(schema.testSchedules).all();
  return sortTestScheduleRows(rows);
}

export function getDistinctTestScheduleCramSchools(): string[] {
  const db = getDb();
  const rows = db
    .select({ cramSchool: schema.testSchedules.cramSchool })
    .from(schema.testSchedules)
    .all();
  const names = new Set<string>();
  for (const row of rows) {
    const name = row.cramSchool?.trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "ja"));
}

export function createTestSchedule(input: TestScheduleInput) {
  const db = getDb();
  const id = uuid();
  db.insert(schema.testSchedules)
    .values({
      id,
      cramSchool: input.cramSchool?.trim() || null,
      grade: input.grade.trim(),
      testName: input.testName,
      testDate: input.testDate ?? null,
      displayText: input.displayText,
      yearMonth: input.yearMonth,
      inTestCourse: input.inTestCourse ? 1 : 0,
    })
    .run();
  invalidateTestScheduleCache();
  return id;
}

export function updateTestSchedule(id: string, input: TestScheduleInput) {
  const db = getDb();
  const grade = input.grade.trim();
  db.update(schema.testSchedules)
    .set({
      cramSchool: input.cramSchool?.trim() || null,
      grade,
      testName: input.testName,
      testDate: input.testDate ?? null,
      displayText: input.displayText,
      yearMonth: input.yearMonth,
      inTestCourse: input.inTestCourse ? 1 : 0,
    })
    .where(eq(schema.testSchedules.id, id))
    .run();
  pruneMisplacedStudentMonthTests(db, id, {
    testDate: input.testDate ?? null,
    yearMonth: input.yearMonth,
    grade,
  });
  invalidateTestScheduleCache();
}

export function deleteTestSchedule(id: string) {
  const db = getDb();
  db.delete(schema.studentTestResults)
    .where(eq(schema.studentTestResults.testScheduleId, id))
    .run();
  db.delete(schema.studentMonthTests)
    .where(eq(schema.studentMonthTests.testScheduleId, id))
    .run();
  db.delete(schema.studentMonthTestDismissals)
    .where(eq(schema.studentMonthTestDismissals.testScheduleId, id))
    .run();
  db.delete(schema.programMonthTests)
    .where(eq(schema.programMonthTests.testScheduleId, id))
    .run();
  db.delete(schema.testSchedules)
    .where(eq(schema.testSchedules.id, id))
    .run();
  invalidateTestScheduleCache();
}

export function bulkSaveTestSchedules(
  rows: SpreadsheetRow[],
  deletedIds: string[] = [],
): SpreadsheetRow[] {
  const db = getDb();
  const validRows = rows.filter((r) => !isRowEmpty(r));
  const saved: SpreadsheetRow[] = [];

  db.transaction((tx) => {
    for (const id of deletedIds) {
      tx.delete(schema.studentTestResults)
        .where(eq(schema.studentTestResults.testScheduleId, id))
        .run();
      tx.delete(schema.studentMonthTests)
        .where(eq(schema.studentMonthTests.testScheduleId, id))
        .run();
      tx.delete(schema.studentMonthTestDismissals)
        .where(eq(schema.studentMonthTestDismissals.testScheduleId, id))
        .run();
      tx.delete(schema.programMonthTests)
        .where(eq(schema.programMonthTests.testScheduleId, id))
        .run();
      tx.delete(schema.testSchedules)
        .where(eq(schema.testSchedules.id, id))
        .run();
    }

    for (const row of validRows) {
      const data = {
        cramSchool: row.cramSchool.trim() || null,
        grade: row.grade.trim(),
        testName: row.testName.trim(),
        testDate: row.testDate.trim() || null,
        displayText: row.displayText.trim(),
        yearMonth: row.yearMonth.trim(),
        inTestCourse: row.inTestCourse ? 1 : 0,
      };

      if (row.id) {
        const existing = tx
          .select({ inTestCourse: schema.testSchedules.inTestCourse })
          .from(schema.testSchedules)
          .where(eq(schema.testSchedules.id, row.id))
          .get();
        const wasInCourse = rowInTestCourse(existing?.inTestCourse);
        const nowInCourse = rowInTestCourse(data.inTestCourse);

        tx.update(schema.testSchedules)
          .set(data)
          .where(eq(schema.testSchedules.id, row.id))
          .run();

        pruneMisplacedStudentMonthTests(tx, row.id, {
          testDate: data.testDate,
          yearMonth: data.yearMonth,
          grade: data.grade,
        });

        if (wasInCourse && !nowInCourse) {
          const links = tx
            .select({
              id: schema.studentMonthTests.id,
              studentId: schema.studentMonthTests.studentId,
            })
            .from(schema.studentMonthTests)
            .where(eq(schema.studentMonthTests.testScheduleId, row.id))
            .all();

          for (const link of links) {
            const hasResult = tx
              .select({ id: schema.studentTestResults.id })
              .from(schema.studentTestResults)
              .where(
                and(
                  eq(schema.studentTestResults.studentId, link.studentId),
                  eq(schema.studentTestResults.testScheduleId, row.id),
                ),
              )
              .get();
            if (!hasResult) {
              tx.delete(schema.studentMonthTests)
                .where(eq(schema.studentMonthTests.id, link.id))
                .run();
            }
          }
        }
        saved.push({
          id: row.id,
          cramSchool: data.cramSchool ?? "",
          grade: data.grade,
          testName: data.testName,
          testDate: data.testDate ?? "",
          displayText: data.displayText,
          yearMonth: data.yearMonth,
          inTestCourse: rowInTestCourse(data.inTestCourse),
        });
      } else {
        const id = uuid();
        tx.insert(schema.testSchedules)
          .values({ id, ...data })
          .run();
        saved.push({
          id,
          cramSchool: data.cramSchool ?? "",
          grade: data.grade,
          testName: data.testName,
          testDate: data.testDate ?? "",
          displayText: data.displayText,
          yearMonth: data.yearMonth,
          inTestCourse: rowInTestCourse(data.inTestCourse),
        });
      }
    }
  });

  invalidateTestScheduleCache();
  return saved;
}
