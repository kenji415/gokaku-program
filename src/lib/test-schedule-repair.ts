import type Database from "better-sqlite3";
import {
  reconcileTestScheduleFields,
  testBelongsToYearMonth,
} from "./test-schedule-utils";

const REPAIR_KEY = "test_schedule_month_repair_v2";

type TestRow = {
  id: string;
  test_name: string | null;
  test_date: string | null;
  display_text: string;
  year_month: string;
};

type LinkRow = {
  id: string;
  year_month: string;
  test_schedule_id: string;
};

export function runTestScheduleRepair(sqlite: Database.Database) {
  const done = sqlite
    .prepare(`SELECT value FROM app_meta WHERE key = ?`)
    .get(REPAIR_KEY) as { value: string } | undefined;
  if (done) return;

  const tests = sqlite
    .prepare(
      `SELECT id, test_name, test_date, display_text, year_month FROM test_schedules`,
    )
    .all() as TestRow[];

  const updateTest = sqlite.prepare(
    `UPDATE test_schedules SET test_date = ?, display_text = ?, year_month = ? WHERE id = ?`,
  );

  for (const test of tests) {
    const derived = reconcileTestScheduleFields({
      testName: test.test_name,
      testDate: test.test_date,
      displayText: test.display_text,
      yearMonth: test.year_month,
    });
    const testDate = derived.testDate || test.test_date || null;
    const displayText = derived.displayText || test.display_text;
    const yearMonth = derived.yearMonth;

    if (
      yearMonth !== test.year_month ||
      testDate !== test.test_date ||
      displayText !== test.display_text
    ) {
      updateTest.run(testDate, displayText, yearMonth, test.id);
    }
  }

  const refreshed = sqlite
    .prepare(`SELECT id, test_date, year_month FROM test_schedules`)
    .all() as Pick<TestRow, "id" | "test_date" | "year_month">[];
  const testById = new Map(refreshed.map((test) => [test.id, test]));

  const links = sqlite
    .prepare(
      `SELECT id, year_month, test_schedule_id FROM student_month_tests`,
    )
    .all() as LinkRow[];
  const deleteLink = sqlite.prepare(
    `DELETE FROM student_month_tests WHERE id = ?`,
  );

  for (const link of links) {
    const test = testById.get(link.test_schedule_id);
    if (
      !test ||
      !testBelongsToYearMonth(
        { testDate: test.test_date, yearMonth: test.year_month },
        link.year_month,
      )
    ) {
      deleteLink.run(link.id);
    }
  }

  sqlite
    .prepare(`INSERT INTO app_meta (key, value) VALUES (?, '1')`)
    .run(REPAIR_KEY);
}
