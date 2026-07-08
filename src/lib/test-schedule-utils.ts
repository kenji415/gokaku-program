/** 日付入力は半角の「2026/4/15」または「2026/4」のみ */

import { GRADES, TEST_SCHEDULE_CRAM_SCHOOL_ORDER } from "./constants";

const UNDATED_YEAR_MONTH = "1899-12";

export type DerivedSchedule = {
  testDate: string;
  yearMonth: string;
  displayText: string;
};

export type SpreadsheetRow = {
  id?: string;
  cramSchool: string;
  grade: string;
  testName: string;
  testDate: string;
  yearMonth: string;
  displayText: string;
  inTestCourse: boolean;
};

type ParsedTestDate = {
  year: number;
  month: number;
  day: number | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 日付があれば日付の年月を優先（DBの year_month と食い違う行を除外） */
export function resolveTestScheduleYearMonth(
  testDate: string | null | undefined,
  storedYearMonth: string,
): string {
  const normalized = normalizeDateInput(testDate ?? "");
  const match = normalized.match(/^(\d{4})\/(\d{1,2})/);
  if (match) {
    return `${match[1]}-${pad2(Number(match[2]))}`;
  }
  return storedYearMonth;
}

export function testBelongsToYearMonth(
  test: { testDate?: string | null; yearMonth: string },
  targetYearMonth: string,
): boolean {
  return (
    resolveTestScheduleYearMonth(test.testDate, test.yearMonth) ===
    targetYearMonth
  );
}

/** 新規テストの日付が月ボックスの年月と一致するか（空欄は可） */
export function testDateInputAllowedForYearMonth(
  testDateInput: string,
  targetYearMonth: string,
): boolean {
  const normalized = normalizeDateInput(testDateInput);
  if (!normalized) return true;
  return (
    resolveTestScheduleYearMonth(normalized, targetYearMonth) === targetYearMonth
  );
}

/** 全角数字・スラッシュを半角に変換 */
export function toHalfWidthDateChars(raw: string): string {
  return raw
    .replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/[／]/g, "/");
}

/** 入力中: 半角数字とスラッシュ以外を除去 */
export function sanitizeTestDateInput(raw: string): string {
  return toHalfWidthDateChars(raw).replace(/[^\d/]/g, "");
}

/** type="date" 用: 2026/4/15 → 2026-04-15 */
export function testDateToNativeInput(value: string): string {
  const normalized = normalizeDateInput(value);
  const match = normalized.match(/^(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?$/);
  if (!match) return "";
  const month = pad2(Number(match[2]));
  const day = match[3] ? pad2(Number(match[3])) : "01";
  return `${match[1]}-${month}-${day}`;
}

/** type="date" から: 2026-04-15 → 2026/4/15 */
export function nativeInputToTestDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${Number(match[1])}/${Number(match[2])}/${Number(match[3])}`;
}

function parseTestDateParts(input: string): ParsedTestDate | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const slash = trimmed.match(/^(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?$/);
  if (slash) {
    const year = Number(slash[1]);
    const month = Number(slash[2]);
    const day = slash[3] ? Number(slash[3]) : null;
    if (month >= 1 && month <= 12) {
      return { year, month, day };
    }
    return null;
  }

  const spaceParts = trimmed.split(/\s+/).filter(Boolean);
  if (spaceParts.length >= 2 && /^\d{4}$/.test(spaceParts[0])) {
    const year = Number(spaceParts[0]);
    const month = Number(spaceParts[1]);
    const day = spaceParts.length >= 3 ? Number(spaceParts[2]) : null;
    if (month >= 1 && month <= 12) {
      return { year, month, day };
    }
  }

  return null;
}

function formatCanonicalTestDate(parsed: ParsedTestDate): string {
  if (parsed.day != null) {
    return `${parsed.year}/${parsed.month}/${parsed.day}`;
  }
  return `${parsed.year}/${parsed.month}`;
}

/** 貼り付け・保存用: 各種入力を半角スラッシュ形式に正規化 */
export function normalizeDateInput(
  raw: string,
  defaultYear = 2026,
): string {
  const input = raw.trim();
  if (!input) return "";

  const japaneseStyle = toHalfWidthDateChars(input)
    .replace(/年/g, "/")
    .replace(/月/g, "/")
    .replace(/日/g, "");
  const parsedFromJapanese = parseTestDateParts(japaneseStyle);
  if (parsedFromJapanese) {
    return formatCanonicalTestDate(parsedFromJapanese);
  }

  const sanitized = sanitizeTestDateInput(input);
  const parsedFromSlash = parseTestDateParts(sanitized);
  if (parsedFromSlash) {
    return formatCanonicalTestDate(parsedFromSlash);
  }

  const spaceParts = input.split(/\s+/).filter(Boolean);
  if (spaceParts.length >= 2 && /^\d{4}$/.test(spaceParts[0])) {
    const year = Number(spaceParts[0]);
    const month = Number(spaceParts[1]);
    const day = spaceParts.length >= 3 ? Number(spaceParts[2]) : null;
    if (month >= 1 && month <= 12) {
      return formatCanonicalTestDate({ year, month, day });
    }
  }

  const md = sanitized.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (md) {
    return formatCanonicalTestDate({
      year: defaultYear,
      month: Number(md[1]),
      day: Number(md[2]),
    });
  }

  const ym = input.match(/^(\d{4})年(\d{1,2})月/);
  if (ym) {
    return formatCanonicalTestDate({
      year: Number(ym[1]),
      month: Number(ym[2]),
      day: null,
    });
  }

  return sanitized;
}

export function hasTestScheduleDate(testDate: string | null | undefined): boolean {
  return parseTestDateParts(normalizeDateInput(testDate ?? "")) != null;
}

/** display_text 先頭の「06/28 」形式から日付を復元 */
export function extractDateFromDisplayText(
  displayText: string | null | undefined,
): string {
  const trimmed = displayText?.trim() ?? "";
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\s+/);
  if (!match) return "";
  return normalizeDateInput(`${match[1]}/${match[2]}`);
}

/** 保存済み行の日付・年月・表示名を整合させる（修復・再計算用） */
export function reconcileTestScheduleFields(row: {
  testName?: string | null;
  testDate?: string | null;
  displayText?: string | null;
  yearMonth?: string | null;
}): DerivedSchedule & { yearMonth: string } {
  const name = row.testName?.trim() ?? "";
  let dateInput = row.testDate?.trim() ?? "";

  if (!hasFullTestScheduleDay(dateInput)) {
    const fromDisplay = extractDateFromDisplayText(row.displayText);
    if (fromDisplay) {
      dateInput = fromDisplay;
    }
  }

  const derived = deriveScheduleFields(name, dateInput);
  const yearMonth =
    derived.yearMonth !== UNDATED_YEAR_MONTH
      ? derived.yearMonth
      : (row.yearMonth?.trim() || UNDATED_YEAR_MONTH);

  return {
    ...derived,
    yearMonth,
    displayText: derived.displayText || row.displayText?.trim() || name,
  };
}

export function hasFullTestScheduleDay(
  testDate: string | null | undefined,
): boolean {
  const parsed = parseTestDateParts(normalizeDateInput(testDate ?? ""));
  return (
    parsed != null && parsed.day != null && parsed.day >= 1 && parsed.day <= 31
  );
}

export function formatTestScheduleDisplayText(row: {
  testName?: string | null;
  testDate?: string | null;
  displayText?: string | null;
}): string {
  const name = row.testName?.trim();
  if (!hasFullTestScheduleDay(row.testDate)) {
    if (name) return name;
    const legacy = row.displayText?.trim() ?? "";
    const stripped = legacy.replace(/^\d{1,2}\/\d{1,2}\s+/, "");
    return stripped || legacy;
  }
  return row.displayText?.trim() || name || "";
}

export function deriveScheduleFields(
  testName: string,
  testDateInput: string,
): DerivedSchedule {
  const name = testName.trim();
  const input = testDateInput.trim().replace(/\r/g, "");

  if (!name) {
    return { testDate: "", yearMonth: UNDATED_YEAR_MONTH, displayText: "" };
  }

  if (!input) {
    return {
      testDate: "",
      yearMonth: UNDATED_YEAR_MONTH,
      displayText: name,
    };
  }

  const normalizedInput = normalizeDateInput(input);
  const parsed = parseTestDateParts(normalizedInput);

  if (parsed) {
    const { year, month, day } = parsed;
    const yearMonth = `${year}-${pad2(month)}`;
    const normalizedDate = formatCanonicalTestDate(parsed);

    if (day != null && day >= 1 && day <= 31) {
      return {
        testDate: normalizedDate,
        yearMonth,
        displayText: `${pad2(month)}/${pad2(day)} ${name}`,
      };
    }

    return {
      testDate: normalizedDate,
      yearMonth,
      displayText: name,
    };
  }

  return {
    testDate: normalizedInput || input,
    yearMonth: UNDATED_YEAR_MONTH,
    displayText: name,
  };
}

export function rowFromInputs(
  partial: Pick<
    SpreadsheetRow,
    "cramSchool" | "grade" | "testName" | "testDate"
  > & { inTestCourse?: boolean },
): SpreadsheetRow {
  const normalizedDate = normalizeDateInput(partial.testDate);
  const derived = deriveScheduleFields(partial.testName, normalizedDate);
  return {
    ...partial,
    testDate: derived.testDate || normalizedDate,
    yearMonth: derived.yearMonth,
    displayText: derived.displayText,
    inTestCourse: partial.inTestCourse ?? false,
  };
}

export function isRowEmpty(row: SpreadsheetRow): boolean {
  return !row.cramSchool.trim() && !row.testName.trim();
}

export function parsePastedRows(text: string): SpreadsheetRow[] {
  const lines = text.split(/\n/).filter((l) => l.trim());
  const rows: SpreadsheetRow[] = [];

  for (const line of lines) {
    const cols = line.split("\t");
    if (cols.length < 3) continue;

    const cramSchool = cols[0]?.trim() ?? "";
    const grade = cols[1]?.trim() ?? "";
    const testName = cols[2]?.trim() ?? "";
    const testDate = normalizeDateInput(cols[3]?.trim() ?? "");

    if (
      cramSchool === "塾名" ||
      cramSchool.includes("テスト日時") ||
      (!cramSchool && !testName)
    ) {
      continue;
    }

    if (!cramSchool || !grade || !testName) continue;

    rows.push(
      rowFromInputs({
        cramSchool,
        grade,
        testName,
        testDate,
        inTestCourse: Boolean(cramSchool),
      }),
    );
  }

  return rows;
}

export function emptyRow(): SpreadsheetRow {
  return {
    cramSchool: "",
    grade: "6年",
    testName: "",
    testDate: "",
    yearMonth: "",
    displayText: "",
    inTestCourse: false,
  };
}

export function moveRowInList<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  const insertAt = from < to ? to - 1 : to;
  next.splice(insertAt, 0, item);
  return next;
}

type SortableTestRow = {
  cramSchool?: string | null;
  grade: string;
  testDate?: string | null;
  yearMonth?: string | null;
  testName?: string | null;
};

const OTHER_CRAM_SCHOOL_RANK = 500;
const SONOTA_CRAM_SCHOOL_RANK = 900;
const EMPTY_CRAM_SCHOOL_RANK = 950;
const UNDATED_EVENT_RANK = 9_999_999;

function cramSchoolSortRank(name: string | null | undefined): number {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return EMPTY_CRAM_SCHOOL_RANK;
  if (trimmed === "その他") return SONOTA_CRAM_SCHOOL_RANK;

  const idx = (TEST_SCHEDULE_CRAM_SCHOOL_ORDER as readonly string[]).indexOf(
    trimmed,
  );
  if (idx >= 0) return idx;

  return OTHER_CRAM_SCHOOL_RANK;
}

function gradeSortRank(grade: string): number {
  const idx = (GRADES as readonly string[]).indexOf(grade);
  return idx >= 0 ? idx : GRADES.length;
}

/** 開催日時の並び用（古い順）。日未定は同月内で後ろ、完全未定は最後 */
export function eventDateSortRank(
  testDate: string | null | undefined,
  yearMonth: string | null | undefined,
): number {
  const parsed = parseTestDateParts(normalizeDateInput(testDate ?? ""));
  if (parsed) {
    const day = parsed.day ?? 32;
    return parsed.year * 10_000 + parsed.month * 100 + day;
  }

  const ym = (yearMonth ?? "").match(/^(\d{4})-(\d{2})$/);
  if (ym && ym[1] !== UNDATED_YEAR_MONTH.slice(0, 4)) {
    return Number(ym[1]) * 10_000 + Number(ym[2]) * 100 + 32;
  }

  return UNDATED_EVENT_RANK;
}

export function compareTestSchedules(
  a: SortableTestRow,
  b: SortableTestRow,
): number {
  const cramA = cramSchoolSortRank(a.cramSchool);
  const cramB = cramSchoolSortRank(b.cramSchool);
  if (cramA !== cramB) return cramA - cramB;

  if (cramA === OTHER_CRAM_SCHOOL_RANK) {
    const nameCmp = (a.cramSchool ?? "").localeCompare(
      b.cramSchool ?? "",
      "ja",
    );
    if (nameCmp !== 0) return nameCmp;
  }

  const gradeA = gradeSortRank(a.grade);
  const gradeB = gradeSortRank(b.grade);
  if (gradeA !== gradeB) return gradeA - gradeB;

  const dateA = eventDateSortRank(a.testDate, a.yearMonth);
  const dateB = eventDateSortRank(b.testDate, b.yearMonth);
  if (dateA !== dateB) return dateA - dateB;

  return (a.testName ?? "").localeCompare(b.testName ?? "", "ja");
}

export function sortTestScheduleRows<T extends SortableTestRow>(rows: T[]): T[] {
  return [...rows].sort(compareTestSchedules);
}

/** 学年の大きい順（中学3年→…→6年→…→1年） */
export function sortTestSchedulesByGradeDesc<T extends SortableTestRow>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const gradeCmp = gradeSortRank(b.grade) - gradeSortRank(a.grade);
    if (gradeCmp !== 0) return gradeCmp;
    return compareTestSchedules(a, b);
  });
}
