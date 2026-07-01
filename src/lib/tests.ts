import { and, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import * as schema from "./db/schema";
import type { SpreadsheetRow } from "./test-schedule-utils";
import { isRowEmpty, sortTestScheduleRows } from "./test-schedule-utils";
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

export function listTestSchedules() {
  const db = getDb();
  const rows = db.select().from(schema.testSchedules).all();
  return sortTestScheduleRows(rows);
}

export function createTestSchedule(input: TestScheduleInput) {
  const db = getDb();
  const id = uuid();
  db.insert(schema.testSchedules)
    .values({
      id,
      cramSchool: input.cramSchool ?? null,
      grade: input.grade,
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
  db.update(schema.testSchedules)
    .set({
      cramSchool: input.cramSchool ?? null,
      grade: input.grade,
      testName: input.testName,
      testDate: input.testDate ?? null,
      displayText: input.displayText,
      yearMonth: input.yearMonth,
      inTestCourse: input.inTestCourse ? 1 : 0,
    })
    .where(eq(schema.testSchedules.id, id))
    .run();
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
