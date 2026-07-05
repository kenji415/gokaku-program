import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import * as schema from "./db/schema";
import { buildMonthSlots, parseYearMonth } from "./months";
import {
  formatTestScheduleDisplayText,
  hasTestScheduleDate,
  sortTestScheduleRows,
  sortTestSchedulesByGradeDesc,
  testBelongsToYearMonth,
} from "./test-schedule-utils";
import { isBrokenStudentName } from "./student-spreadsheet-utils";
import { studentNameMatchesQuery } from "./student-name";
import { getStudentTestResultsForIds, getRecentStudentTestResults } from "./test-results";
import type { RecentTestResult } from "./test-results";
import type { StudentTestResultInput } from "./test-result-types";
import { getCachedTestSchedules } from "./test-schedule-cache";
export type { StudentTestResultInput } from "./test-result-types";
export { EMPTY_TEST_RESULT } from "./test-result-types";

type ProgramSheetRow = typeof schema.programSheets.$inferSelect;
type ProgramMonthRow = typeof schema.programMonths.$inferSelect;

export type ProgramMonthData = {
  id: string;
  monthIndex: number;
  yearMonth: string;
  monthLabel: string;
  timelineLabel: string;
  monthTitle: string;
  content: string;
  tests: {
    id: string;
    displayText: string;
    result: StudentTestResultInput | null;
  }[];
};

function timelineLabelFromYearMonth(yearMonth: string): string {
  const { year, month } = parseYearMonth(yearMonth);
  return `${year}.${String(month).padStart(2, "0")}`;
}

function trimOrEmpty(value: string | null | undefined): string {
  return value?.trim() || "";
}

function resolveSheetInitialChallenges(
  sheetChallenges: string | null | undefined,
): string {
  return sheetChallenges?.trim() || "";
}

function resolveSheetCampus(
  storedCampus: string | null | undefined,
  teacherDefaultCampus: string | null | undefined,
  studentCampus: string | null | undefined,
): { campus: string; usesDefaultCampus: boolean } {
  const stored = trimOrEmpty(storedCampus);
  const studentCampusTrim = trimOrEmpty(studentCampus);
  // 旧データ: 集団塾校舎(students.campus)がシート校舎に誤コピーされていた
  const effectiveStored =
    stored && stored === studentCampusTrim ? "" : stored;

  if (effectiveStored) {
    return { campus: effectiveStored, usesDefaultCampus: false };
  }
  const fallback = trimOrEmpty(teacherDefaultCampus);
  return { campus: fallback, usesDefaultCampus: true };
}

/** プログラムシート右上に表示する受験Dr.校舎 */
export function resolveProgramSheetDisplayCampus(
  storedCampus: string | null | undefined,
  teacherDefaultCampus: string | null | undefined,
  studentCampus: string | null | undefined,
): string {
  return resolveSheetCampus(
    storedCampus,
    teacherDefaultCampus,
    studentCampus,
  ).campus;
}

function normalizeSheetCampusForStorage(
  displayCampus: string,
  teacherDefaultCampus: string | null | undefined,
): string | null {
  const value = displayCampus.trim();
  if (!value) return null;
  const defaultValue = trimOrEmpty(teacherDefaultCampus);
  if (value === defaultValue) return null;
  return value;
}

export type ProgramSheetData = {
  id: string;
  studentId: string;
  subject: string;
  teacherId: string;
  startYearMonth: string;
  campus: string;
  usesDefaultCampus: boolean;
  goal: string;
  initialMockExams: string;
  initialChallenges: string;
  recentTestResults: RecentTestResult[];
  student: {
    name: string;
    gender: string | null;
    grade: string;
    cramSchool: string;
    campus: string;
    className: string;
    targetSchool: string;
  };
  teacher: { name: string };
  months: ProgramMonthData[];
};

export function getTeacherAssignments(teacherId: string) {
  const db = getDb();
  return db
    .select({
      assignmentId: schema.studentAssignments.id,
      studentId: schema.students.id,
      studentName: schema.students.name,
      grade: schema.students.grade,
      subject: schema.studentAssignments.subject,
    })
    .from(schema.studentAssignments)
    .innerJoin(
      schema.students,
      eq(schema.students.id, schema.studentAssignments.studentId),
    )
    .where(
      and(
        eq(schema.studentAssignments.teacherId, teacherId),
        isNull(schema.students.graduatedAt),
      ),
    )
    .all();
}

export type MakerStudentListItem = {
  id: string;
  name: string;
  grade: string;
  gender: string | null;
  cramSchool: string;
  campus: string;
  className: string;
  targetSchool: string;
  mySubjects: string[];
  graduatedAt: string | null;
};

function rowToMakerStudentListItem(
  row: {
    id: string;
    name: string;
    grade: string;
    gender: string | null;
    cramSchool: string | null;
    campus: string | null;
    className: string | null;
    targetSchool: string | null;
    graduatedAt?: string | null;
    subject?: string | null;
  },
  mySubjects: string[] = [],
): MakerStudentListItem {
  const subjects =
    mySubjects.length > 0
      ? mySubjects
      : row.subject
        ? [row.subject]
        : [];
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    gender: row.gender,
    cramSchool: row.cramSchool?.trim() ?? "",
    campus: row.campus?.trim() ?? "",
    className: row.className?.trim() ?? "",
    targetSchool: row.targetSchool?.trim() ?? "",
    mySubjects: subjects,
    graduatedAt: row.graduatedAt ?? null,
  };
}

function compareGraduatedStudents(
  a: MakerStudentListItem,
  b: MakerStudentListItem,
): number {
  const aTime = a.graduatedAt ? Date.parse(a.graduatedAt) : 0;
  const bTime = b.graduatedAt ? Date.parse(b.graduatedAt) : 0;
  if (aTime !== bTime) return bTime - aTime;
  return a.name.localeCompare(b.name, "ja");
}

export function listGraduatedStudentsForTeacher(
  teacherId: string,
  searchQuery?: string,
): MakerStudentListItem[] {
  const db = getDb();
  const graduatedRows = db
    .select()
    .from(schema.students)
    .where(isNotNull(schema.students.graduatedAt))
    .all();

  const assignmentStudentIds = new Set(
    db
      .select({ studentId: schema.studentAssignments.studentId })
      .from(schema.studentAssignments)
      .where(eq(schema.studentAssignments.teacherId, teacherId))
      .all()
      .map((row) => row.studentId),
  );

  const sheetStudentIds = new Set(
    db
      .select({ studentId: schema.programSheets.studentId })
      .from(schema.programSheets)
      .where(eq(schema.programSheets.teacherId, teacherId))
      .all()
      .map((row) => row.studentId),
  );

  const teacherAssignments = getTeacherStudentSubjectMap(teacherId);

  let result = graduatedRows
    .filter((student) => {
      if (isBrokenStudentName(student.name)) return false;
      if (student.graduatedByTeacherId === teacherId) return true;
      if (assignmentStudentIds.has(student.id)) return true;
      if (sheetStudentIds.has(student.id)) return true;
      return false;
    })
    .map((student) =>
      rowToMakerStudentListItem(
        student,
        teacherAssignments.get(student.id) ?? [],
      ),
    );

  const q = searchQuery?.trim();
  if (q) {
    result = result.filter((s) => matchesMakerStudentSearch(s, q));
  }

  return result.sort(compareGraduatedStudents);
}

function getTeacherStudentSubjectMap(
  teacherId: string,
): Map<string, string[]> {
  const db = getDb();
  const rows = db
    .select({
      studentId: schema.studentAssignments.studentId,
      subject: schema.studentAssignments.subject,
    })
    .from(schema.studentAssignments)
    .where(eq(schema.studentAssignments.teacherId, teacherId))
    .all();

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.studentId) ?? [];
    if (!list.includes(row.subject)) list.push(row.subject);
    map.set(row.studentId, list);
  }
  return map;
}

function applyTeacherSubjects(
  items: MakerStudentListItem[],
  assignmentMap: Map<string, string[]>,
): void {
  for (const item of items) {
    const subjects = assignmentMap.get(item.id);
    if (subjects) item.mySubjects = subjects;
  }
}

export function listMakerStudentSummaries(
  teacherId: string | null,
  searchQuery?: string,
  options?: { includeGraduated?: boolean; graduatedOnly?: boolean },
): MakerStudentListItem[] {
  if (teacherId && options?.graduatedOnly) {
    return listGraduatedStudentsForTeacher(teacherId, searchQuery);
  }

  const db = getDb();

  const rows = teacherId
    ? db
        .select({
          id: schema.students.id,
          name: schema.students.name,
          grade: schema.students.grade,
          gender: schema.students.gender,
          cramSchool: schema.students.cramSchool,
          campus: schema.students.campus,
          className: schema.students.className,
          targetSchool: schema.students.targetSchool,
          graduatedAt: schema.students.graduatedAt,
          subject: schema.studentAssignments.subject,
        })
        .from(schema.studentAssignments)
        .innerJoin(
          schema.students,
          eq(schema.students.id, schema.studentAssignments.studentId),
        )
        .where(
          and(
            eq(schema.studentAssignments.teacherId, teacherId),
            isNull(schema.students.graduatedAt),
          ),
        )
        .all()
    : db
        .select({
          id: schema.students.id,
          name: schema.students.name,
          grade: schema.students.grade,
          gender: schema.students.gender,
          cramSchool: schema.students.cramSchool,
          campus: schema.students.campus,
          className: schema.students.className,
          targetSchool: schema.students.targetSchool,
          graduatedAt: schema.students.graduatedAt,
          subject: schema.studentAssignments.subject,
        })
        .from(schema.students)
        .leftJoin(
          schema.studentAssignments,
          eq(schema.students.id, schema.studentAssignments.studentId),
        )
        .where(isNull(schema.students.graduatedAt))
        .all();

  const byId = new Map<string, MakerStudentListItem>();

  for (const row of rows) {
    if (isBrokenStudentName(row.name)) continue;

    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, rowToMakerStudentListItem(row));
      continue;
    }

    if (row.subject && !existing.mySubjects.includes(row.subject)) {
      existing.mySubjects.push(row.subject);
    }
  }

  let result = [...byId.values()];
  const q = searchQuery?.trim();
  const teacherAssignments = teacherId
    ? getTeacherStudentSubjectMap(teacherId)
    : null;

  if (teacherAssignments) {
    applyTeacherSubjects(result, teacherAssignments);
  }

  if (q) {
    const inResult = new Set(result.map((s) => s.id));
    const allStudents = db
      .select()
      .from(schema.students)
      .where(isNull(schema.students.graduatedAt))
      .all();
    for (const student of allStudents) {
      if (inResult.has(student.id)) continue;
      if (isBrokenStudentName(student.name)) continue;
      if (!studentNameMatchesQuery(student.name, q)) continue;
      result.push(
        rowToMakerStudentListItem(
          student,
          teacherAssignments?.get(student.id) ?? [],
        ),
      );
    }
    result = result.filter((s) => matchesMakerStudentSearch(s, q));
    if (teacherAssignments) {
      applyTeacherSubjects(result, teacherAssignments);
    }
  }

  if (teacherId && options?.includeGraduated) {
    const graduated = listGraduatedStudentsForTeacher(teacherId, searchQuery);
    const activeIds = new Set(result.map((s) => s.id));
    const active = result
      .filter((s) => !s.graduatedAt)
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
    const archived = [
      ...graduated.filter((s) => !activeIds.has(s.id)),
      ...result.filter((s) => s.graduatedAt),
    ].sort(compareGraduatedStudents);
    return [...active, ...archived];
  }

  return result.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function matchesMakerStudentSearch(
  student: MakerStudentListItem,
  query: string,
): boolean {
  if (studentNameMatchesQuery(student.name, query)) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    student.grade,
    student.cramSchool,
    student.campus,
    student.className,
    student.targetSchool,
    student.mySubjects.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function getAllTestsForMonth(yearMonth: string) {
  return sortTestSchedulesByGradeDesc(
    getCachedTestSchedules().filter(
      (row) =>
        hasTestScheduleDate(row.testDate) &&
        testBelongsToYearMonth(row, yearMonth),
    ),
  );
}

export function getAllTestsForYearMonths(
  yearMonths: string[],
): Record<string, { id: string; displayText: string }[]> {
  const uniqueMonths = [...new Set(yearMonths)];
  const rows = getCachedTestSchedules();
  const result: Record<string, { id: string; displayText: string }[]> = {};

  for (const yearMonth of uniqueMonths) {
    result[yearMonth] = sortTestSchedulesByGradeDesc(
      rows.filter(
        (row) =>
          hasTestScheduleDate(row.testDate) &&
          testBelongsToYearMonth(row, yearMonth),
      ),
    ).map((t) => ({
      id: t.id,
      displayText: formatTestScheduleDisplayText(t),
    }));
  }

  return result;
}

export function getTestsForMonth(
  grade: string,
  yearMonth: string,
  cramSchool?: string | null,
) {
  const pattern = cramSchool?.trim();
  return sortTestScheduleRows(
    getCachedTestSchedules().filter((row) => {
      if (row.grade !== grade) return false;
      if (!hasTestScheduleDate(row.testDate)) return false;
      if (!row.inTestCourse) return false;
      if (pattern && row.cramSchool !== pattern) return false;
      return testBelongsToYearMonth(row, yearMonth);
    }),
  );
}

/** プログラムシートのテスト編集候補（テストコース登録分＋当該生徒が既に選択中の分） */
export function getSelectableTestsForMonth(
  grade: string,
  yearMonth: string,
  mockExamPattern?: string | null,
  studentId?: string | null,
) {
  const db = getDb();
  const rows = getCachedTestSchedules().filter((row) => row.grade === grade);

  const studentLinkedIds = new Set<string>();
  if (studentId) {
    const links = db
      .select({ testScheduleId: schema.studentMonthTests.testScheduleId })
      .from(schema.studentMonthTests)
      .where(
        and(
          eq(schema.studentMonthTests.studentId, studentId),
          eq(schema.studentMonthTests.yearMonth, yearMonth),
        ),
      )
      .all();
    for (const link of links) {
      studentLinkedIds.add(link.testScheduleId);
    }
  }

  const pattern = mockExamPattern?.trim();
  return sortTestScheduleRows(
    rows.filter((row) => {
      if (!hasTestScheduleDate(row.testDate)) return false;
      if (!testBelongsToYearMonth(row, yearMonth)) return false;
      if (studentLinkedIds.has(row.id)) return true;
      if (!row.inTestCourse) return false;
      const cram = row.cramSchool?.trim() ?? "";
      if (pattern) return cram === pattern;
      return !cram;
    }),
  ).map((row) => ({
    ...row,
    displayText: formatTestScheduleDisplayText(row),
  }));
}

/** 模試パターンが設定されている場合、その塾名×学年のテストを月ごとに取得 */
export function getDefaultTestsForStudent(
  studentId: string,
  startYearMonth: string,
): Map<string, string[]> {
  const db = getDb();
  const student = db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, studentId))
    .get();

  const result = new Map<string, string[]>();
  if (!student?.mockExamPattern) return result;

  const slots = buildMonthSlots(startYearMonth);
  for (const slot of slots) {
    const tests = getTestsForMonth(
      student.grade,
      slot.yearMonth,
      student.mockExamPattern,
    );
    if (tests.length > 0) {
      result.set(
        slot.yearMonth,
        tests.map((t) => t.id),
      );
    }
  }
  return result;
}

function consolidateProgramSheets(
  studentId: string,
  subject: string,
  teacherId: string,
): ProgramSheetRow | null {
  const db = getDb();
  const sheets = db
    .select()
    .from(schema.programSheets)
    .where(
      and(
        eq(schema.programSheets.studentId, studentId),
        eq(schema.programSheets.subject, subject),
        eq(schema.programSheets.teacherId, teacherId),
      ),
    )
    .orderBy(desc(schema.programSheets.updatedAt))
    .all();

  if (sheets.length === 0) return null;

  const primary = sheets[0];
  for (const duplicate of sheets.slice(1)) {
    const dupMonths = db
      .select()
      .from(schema.programMonths)
      .where(eq(schema.programMonths.sheetId, duplicate.id))
      .all();

    for (const dupMonth of dupMonths) {
      const primaryMonth = db
        .select()
        .from(schema.programMonths)
        .where(
          and(
            eq(schema.programMonths.sheetId, primary.id),
            eq(schema.programMonths.yearMonth, dupMonth.yearMonth),
          ),
        )
        .get();

      if (!primaryMonth) {
        db.update(schema.programMonths)
          .set({ sheetId: primary.id })
          .where(eq(schema.programMonths.id, dupMonth.id))
          .run();
        continue;
      }

      const primaryHasContent =
        Boolean(primaryMonth.content?.trim()) ||
        Boolean(primaryMonth.monthTitle?.trim());
      const dupHasContent =
        Boolean(dupMonth.content?.trim()) || Boolean(dupMonth.monthTitle?.trim());

      if (!primaryHasContent && dupHasContent) {
        db.update(schema.programMonths)
          .set({
            monthTitle: dupMonth.monthTitle,
            content: dupMonth.content,
          })
          .where(eq(schema.programMonths.id, primaryMonth.id))
          .run();
      }

      db.delete(schema.programMonthTests)
        .where(eq(schema.programMonthTests.programMonthId, dupMonth.id))
        .run();
      db.delete(schema.programMonths)
        .where(eq(schema.programMonths.id, dupMonth.id))
        .run();
    }

    db.delete(schema.programSheets)
      .where(eq(schema.programSheets.id, duplicate.id))
      .run();
  }

  return primary;
}

function getStudentMonthTestIds(
  studentId: string,
  yearMonth: string,
): string[] {
  const db = getDb();
  return db
    .select({ testScheduleId: schema.studentMonthTests.testScheduleId })
    .from(schema.studentMonthTests)
    .where(
      and(
        eq(schema.studentMonthTests.studentId, studentId),
        eq(schema.studentMonthTests.yearMonth, yearMonth),
      ),
    )
    .all()
    .map((row) => row.testScheduleId);
}

function setStudentMonthTests(
  studentId: string,
  yearMonth: string,
  testIds: string[],
) {
  const db = getDb();
  const uniqueIds = filterTestIdsForYearMonth(
    [...new Set(testIds)],
    yearMonth,
  );

  db.transaction((tx) => {
    tx.delete(schema.studentMonthTests)
      .where(
        and(
          eq(schema.studentMonthTests.studentId, studentId),
          eq(schema.studentMonthTests.yearMonth, yearMonth),
        ),
      )
      .run();

    for (const testId of uniqueIds) {
      tx.insert(schema.studentMonthTests)
        .values({
          id: uuid(),
          studentId,
          yearMonth,
          testScheduleId: testId,
        })
        .run();
    }
  });
}

function seedStudentMonthTestsIfEmpty(
  studentId: string,
  yearMonth: string,
  testIds: string[],
) {
  if (getStudentMonthTestIds(studentId, yearMonth).length > 0) return;
  if (testIds.length === 0) return;
  setStudentMonthTests(studentId, yearMonth, testIds);
}

function ensureProgramMonthsForSheet(
  sheetId: string,
  startYearMonth: string,
  studentId: string,
) {
  const db = getDb();
  const slots = buildMonthSlots(startYearMonth);
  const existing = db
    .select()
    .from(schema.programMonths)
    .where(eq(schema.programMonths.sheetId, sheetId))
    .all();
  const byYearMonth = new Map(existing.map((m) => [m.yearMonth, m]));
  const defaultTests = getDefaultTestsForStudent(studentId, startYearMonth);

  for (const slot of slots) {
    const current = byYearMonth.get(slot.yearMonth);
    if (current) {
      db.update(schema.programMonths)
        .set({
          monthIndex: slot.index,
          monthLabel: slot.monthLabel,
        })
        .where(eq(schema.programMonths.id, current.id))
        .run();
      seedStudentMonthTestsIfEmpty(
        studentId,
        slot.yearMonth,
        defaultTests.get(slot.yearMonth) ?? [],
      );
      continue;
    }

    const monthId = uuid();
    db.insert(schema.programMonths)
      .values({
        id: monthId,
        sheetId,
        monthIndex: slot.index,
        yearMonth: slot.yearMonth,
        monthLabel: slot.monthLabel,
        monthTitle: "",
        content: "",
      })
      .run();

    seedStudentMonthTestsIfEmpty(
      studentId,
      slot.yearMonth,
      defaultTests.get(slot.yearMonth) ?? [],
    );
  }
}

function loadVisibleMonths(
  sheetId: string,
  startYearMonth: string,
): ProgramMonthRow[] {
  const db = getDb();
  const slots = buildMonthSlots(startYearMonth);
  const yearMonths = slots.map((slot) => slot.yearMonth);
  const stored = db
    .select()
    .from(schema.programMonths)
    .where(
      and(
        eq(schema.programMonths.sheetId, sheetId),
        inArray(schema.programMonths.yearMonth, yearMonths),
      ),
    )
    .all();
  const byYearMonth = new Map(stored.map((m) => [m.yearMonth, m]));

  return slots.map((slot) => byYearMonth.get(slot.yearMonth)!);
}

function buildMonthsData(
  months: ProgramMonthRow[],
  studentId: string,
): ProgramMonthData[] {
  const db = getDb();
  const yearMonths = months.map((m) => m.yearMonth);
  const testLinks =
    yearMonths.length === 0
      ? []
      : db
          .select()
          .from(schema.studentMonthTests)
          .where(
            and(
              eq(schema.studentMonthTests.studentId, studentId),
              inArray(schema.studentMonthTests.yearMonth, yearMonths),
            ),
          )
          .all();

  const testIds = [...new Set(testLinks.map((t) => t.testScheduleId))];
  const tests =
    testIds.length === 0
      ? []
      : getCachedTestSchedules().filter((row) => testIds.includes(row.id));

  const testMap = new Map(tests.map((t) => [t.id, t]));
  const resultMap = getStudentTestResultsForIds(studentId, testIds);

  return months.map((m) => ({
    id: m.id,
    monthIndex: m.monthIndex,
    yearMonth: m.yearMonth,
    monthLabel: m.monthLabel,
    timelineLabel: timelineLabelFromYearMonth(m.yearMonth),
    monthTitle: m.monthTitle ?? "",
    content: m.content ?? "",
    tests: sortTestSchedulesByGradeDesc(
      testLinks
        .filter((link) => link.yearMonth === m.yearMonth)
        .map((link) => {
          const test = testMap.get(link.testScheduleId);
          const stored = resultMap.get(link.testScheduleId);
          return {
            id: link.testScheduleId,
            displayText: test
              ? formatTestScheduleDisplayText(test)
              : "",
            result: stored ?? null,
            grade: test?.grade ?? "",
            cramSchool: test?.cramSchool ?? "",
            testDate: test?.testDate ?? "",
            yearMonth: test?.yearMonth ?? "",
            testName: test?.testName ?? "",
          };
        })
        .filter((row) => {
          const test = testMap.get(row.id);
          return test ? testBelongsToYearMonth(test, m.yearMonth) : false;
        }),
    ).map(({ id, displayText, result }) => ({ id, displayText, result })),
  }));
}

export function getProgramSheet(sheetId: string): ProgramSheetData | null {
  const db = getDb();

  const sheet = db
    .select()
    .from(schema.programSheets)
    .where(eq(schema.programSheets.id, sheetId))
    .get();

  if (!sheet) return null;

  const student = db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, sheet.studentId))
    .get();

  const teacher = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, sheet.teacherId))
    .get();

  if (!student || !teacher) return null;

  ensureProgramMonthsForSheet(sheet.id, sheet.startYearMonth, sheet.studentId);
  const months = loadVisibleMonths(sheet.id, sheet.startYearMonth);
  const monthsData = buildMonthsData(months, sheet.studentId);
  const { campus, usesDefaultCampus } = resolveSheetCampus(
    sheet.campus,
    teacher.defaultCampus,
    student.campus,
  );

  return {
    id: sheet.id,
    studentId: sheet.studentId,
    subject: sheet.subject,
    teacherId: sheet.teacherId,
    startYearMonth: sheet.startYearMonth,
    campus,
    usesDefaultCampus,
    goal: trimOrEmpty(sheet.goal) || "志望校合格に向けて",
    initialMockExams: trimOrEmpty(sheet.initialMockExams),
    initialChallenges: resolveSheetInitialChallenges(sheet.initialChallenges),
    recentTestResults: getRecentStudentTestResults(sheet.studentId),
    student: {
      name: student.name,
      gender: student.gender,
      grade: student.grade,
      cramSchool: trimOrEmpty(student.cramSchool),
      campus: trimOrEmpty(student.campus),
      className: trimOrEmpty(student.className),
      targetSchool: trimOrEmpty(student.targetSchool),
    },
    teacher: { name: teacher.name },
    months: monthsData,
  };
}

export function findOrCreateProgramSheet(params: {
  studentId: string;
  subject: string;
  teacherId: string;
  startYearMonth: string;
}): ProgramSheetData {
  const db = getDb();
  const now = new Date().toISOString();

  let sheet = consolidateProgramSheets(
    params.studentId,
    params.subject,
    params.teacherId,
  );

  if (!sheet) {
    const student = db
      .select()
      .from(schema.students)
      .where(eq(schema.students.id, params.studentId))
      .get();
    const sheetId = uuid();
    db.insert(schema.programSheets)
      .values({
        id: sheetId,
        studentId: params.studentId,
        subject: params.subject,
        teacherId: params.teacherId,
        startYearMonth: params.startYearMonth,
        campus: null,
        goal: student?.goal ?? null,
        initialMockExams: student?.initialMockExams ?? null,
        initialChallenges: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    sheet = db
      .select()
      .from(schema.programSheets)
      .where(eq(schema.programSheets.id, sheetId))
      .get()!;
  } else if (sheet.startYearMonth !== params.startYearMonth) {
    db.update(schema.programSheets)
      .set({
        startYearMonth: params.startYearMonth,
        updatedAt: now,
      })
      .where(eq(schema.programSheets.id, sheet.id))
      .run();
    sheet = {
      ...sheet,
      startYearMonth: params.startYearMonth,
      updatedAt: now,
    };
  }

  return getProgramSheet(sheet.id)!;
}

function filterTestIdsForYearMonth(
  testIds: string[],
  yearMonth: string,
): string[] {
  if (testIds.length === 0) return [];
  const byId = new Map(getCachedTestSchedules().map((row) => [row.id, row]));
  const allowed = new Set(
    testIds.filter((id) => {
      const row = byId.get(id);
      return row ? testBelongsToYearMonth(row, yearMonth) : false;
    }),
  );
  return testIds.filter((id) => allowed.has(id));
}

export function saveProgramSheet(
  sheetId: string,
  payload: {
    campus: string;
    goal: string;
    initialMockExams: string;
    initialChallenges: string;
    months: {
      id: string;
      monthTitle: string;
      content: string;
      testIds: string[];
    }[];
  },
) {
  const db = getDb();
  const now = new Date().toISOString();

  const sheet = db
    .select()
    .from(schema.programSheets)
    .where(eq(schema.programSheets.id, sheetId))
    .get();
  if (!sheet) return;

  const teacher = db
    .select({ defaultCampus: schema.users.defaultCampus })
    .from(schema.users)
    .where(eq(schema.users.id, sheet.teacherId))
    .get();

  const monthIds = payload.months.map((month) => month.id);
  const monthRows =
    monthIds.length === 0
      ? []
      : db
          .select()
          .from(schema.programMonths)
          .where(inArray(schema.programMonths.id, monthIds))
          .all();
  const monthById = new Map(monthRows.map((month) => [month.id, month]));

  db.transaction((tx) => {
    for (const month of payload.months) {
      tx.update(schema.programMonths)
        .set({
          monthTitle: month.monthTitle,
          content: month.content,
        })
        .where(eq(schema.programMonths.id, month.id))
        .run();

      const monthRow = monthById.get(month.id);
      if (!monthRow) continue;

      const filteredTestIds = filterTestIdsForYearMonth(
        month.testIds,
        monthRow.yearMonth,
      );
      const uniqueIds = [...new Set(filteredTestIds)];

      tx.delete(schema.studentMonthTests)
        .where(
          and(
            eq(schema.studentMonthTests.studentId, sheet.studentId),
            eq(schema.studentMonthTests.yearMonth, monthRow.yearMonth),
          ),
        )
        .run();

      for (const testId of uniqueIds) {
        tx.insert(schema.studentMonthTests)
          .values({
            id: uuid(),
            studentId: sheet.studentId,
            yearMonth: monthRow.yearMonth,
            testScheduleId: testId,
          })
          .run();
      }
    }

    tx.update(schema.programSheets)
      .set({
        campus: normalizeSheetCampusForStorage(
          payload.campus,
          teacher?.defaultCampus,
        ),
        goal: payload.goal.trim() || null,
        initialMockExams: payload.initialMockExams.trim() || null,
        initialChallenges: payload.initialChallenges.trim() || null,
        updatedAt: now,
      })
      .where(eq(schema.programSheets.id, sheetId))
      .run();
  });
}

export function teacherCanAccessSheet(
  sheetId: string,
  teacherId: string,
): boolean {
  const sheet = getProgramSheet(sheetId);
  if (!sheet) return false;
  if (sheet.teacherId === teacherId) return true;
  const assignments = getTeacherAssignments(teacherId);
  return assignments.some(
    (a) => a.studentId === sheet.studentId && a.subject === sheet.subject,
  );
}

export function monthContentFilled(content: string | null | undefined): boolean {
  return Boolean(content?.trim());
}

export function getUnfilledMonthLabels(
  months: { monthLabel: string; content: string }[],
): string[] {
  return months
    .filter((month) => !monthContentFilled(month.content))
    .map((month) => month.monthLabel);
}

export function recordProgramSheetPdfExport(sheetId: string): string {
  const db = getDb();
  const now = new Date().toISOString();
  db.update(schema.programSheets)
    .set({ pdfExportedAt: now, updatedAt: now })
    .where(eq(schema.programSheets.id, sheetId))
    .run();
  return now;
}

export type BulkPdfStudentStatus = {
  studentId: string;
  sheetId: string | null;
  pdfExportedAt: string | null;
  unfilledMonthLabels: string[];
};

export function getBulkPdfStudentStatuses(
  teacherId: string,
  startYearMonth: string,
  subject: string,
): BulkPdfStudentStatus[] {
  const db = getDb();
  const slots = buildMonthSlots(startYearMonth);
  const yearMonths = slots.map((slot) => slot.yearMonth);
  const allLabels = slots.map((slot) => slot.monthLabel);

  const assignments = getTeacherAssignments(teacherId).filter(
    (assignment) => assignment.subject === subject,
  );

  return assignments.map((assignment) => {
    const sheet = consolidateProgramSheets(
      assignment.studentId,
      subject,
      teacherId,
    );

    if (!sheet) {
      return {
        studentId: assignment.studentId,
        sheetId: null,
        pdfExportedAt: null,
        unfilledMonthLabels: allLabels,
      };
    }

    const monthRows = db
      .select()
      .from(schema.programMonths)
      .where(eq(schema.programMonths.sheetId, sheet.id))
      .all()
      .filter((month) => yearMonths.includes(month.yearMonth));

    const monthByYearMonth = new Map(
      monthRows.map((month) => [month.yearMonth, month]),
    );

    const unfilledMonthLabels = slots
      .filter(
        (slot) =>
          !monthContentFilled(monthByYearMonth.get(slot.yearMonth)?.content),
      )
      .map((slot) => slot.monthLabel);

    return {
      studentId: assignment.studentId,
      sheetId: sheet.id,
      pdfExportedAt: sheet.pdfExportedAt ?? null,
      unfilledMonthLabels,
    };
  });
}
