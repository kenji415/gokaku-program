import { GRADES, SUBJECTS } from "./constants";

export type StudentSpreadsheetRow = {
  id?: string;
  name: string;
  gender: string;
  grade: string;
  cramSchool: string;
  campus: string;
  className: string;
  mockExamPattern: string;
  targetSchool: string;
  initialMockExams: string;
  initialChallenges: string;
  teachers: Record<string, string>;
};

export function emptyStudentRow(): StudentSpreadsheetRow {
  return {
    name: "",
    gender: "",
    grade: GRADES[0],
    cramSchool: "",
    campus: "",
    className: "",
    mockExamPattern: "",
    targetSchool: "",
    initialMockExams: "",
    initialChallenges: "",
    teachers: Object.fromEntries(SUBJECTS.map((s) => [s, ""])),
  };
}

export function studentRowFromDb(
  student: {
    id: string;
    name: string;
    gender: string | null;
    grade: string;
    cramSchool: string | null;
    campus: string | null;
    className: string | null;
    mockExamPattern: string | null;
    targetSchool: string | null;
    initialMockExams: string | null;
    initialChallenges: string | null;
  },
  assignments: { subject: string; teacherId: string }[],
): StudentSpreadsheetRow {
  const teachers = Object.fromEntries(SUBJECTS.map((s) => [s, ""]));
  for (const a of assignments) {
    teachers[a.subject] = a.teacherId;
  }

  return {
    id: student.id,
    name: student.name,
    gender: student.gender ?? "",
    grade: student.grade,
    cramSchool: student.cramSchool ?? "",
    campus: student.campus ?? "",
    className: student.className ?? "",
    mockExamPattern: student.mockExamPattern ?? "",
    targetSchool: student.targetSchool ?? "",
    initialMockExams: student.initialMockExams ?? "",
    initialChallenges: student.initialChallenges ?? "",
    teachers,
  };
}

export function isStudentRowEmpty(row: StudentSpreadsheetRow): boolean {
  return !row.name.trim();
}

/** 引用符付きセル・セル内改行に対応したTSV分割 */
export function splitTsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    pushField();
    if (row.some((cell) => cell.trim())) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === "\t") {
      pushField();
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && next === "\n") i++;
      pushRow();
    } else {
      field += c;
    }
  }

  if (field || row.length > 0) pushRow();
  return rows;
}

function isGradeValue(value: string): boolean {
  return (GRADES as readonly string[]).includes(value);
}

function rowFromPastedCells(cells: string[]): StudentSpreadsheetRow | null {
  const raw = [...cells];
  while (raw.length < 11) raw.push("");
  const cols = raw.map((c) => c.trim());

  let nameIdx = 0;
  if (/^\d+$/.test(cols[0] ?? "") && cols[1]) {
    nameIdx = 1;
  }

  const name = (cols[nameIdx] ?? "").replace(/\s+/g, "　").trim();
  if (!name || name === "生徒名" || name.includes("性別")) return null;

  // 氏名の直後に空列がある形式（Excel原本）と、ない形式（当画面からのコピー）の両対応
  let dataStart = nameIdx + 1;
  if (cols[dataStart] !== "男" && cols[dataStart] !== "女") {
    dataStart = nameIdx + 2;
  }

  const gender =
    cols[dataStart] === "男" || cols[dataStart] === "女" ? cols[dataStart] : "";

  const grade = isGradeValue(cols[dataStart + 1] ?? "")
    ? cols[dataStart + 1]
    : GRADES[0];

  // 空欄列も位置を維持して読み取る（左詰めしない）
  const cramSchool = cols[dataStart + 2] ?? "";
  const campus = cols[dataStart + 3] ?? "";
  const className = cols[dataStart + 4] ?? "";
  const targetSchool = cols[dataStart + 5] ?? "";
  const initialMockExams = cols[dataStart + 6] ?? "";
  const mockExamPattern = cols[dataStart + 7] ?? "";

  const challengeCells = cols.slice(dataStart + 8);
  const initialChallenges =
    challengeCells.length <= 1
      ? (challengeCells[0] ?? "")
      : challengeCells
          .map((c) => c.trim())
          .filter(Boolean)
          .join("\n");

  return {
    ...emptyStudentRow(),
    name,
    gender,
    grade,
    cramSchool,
    campus,
    className,
    targetSchool,
    initialMockExams,
    mockExamPattern,
    initialChallenges,
  };
}

/** 氏名欄に表全体が入ってしまった行を分割 */
export function expandBrokenStudentRows(
  rows: StudentSpreadsheetRow[],
): { rows: StudentSpreadsheetRow[]; removedIds: string[] } {
  const expanded: StudentSpreadsheetRow[] = [];
  const removedIds: string[] = [];

  for (const row of rows) {
    if (row.name.includes("\t")) {
      const parsed = parsePastedStudentRows(row.name);
      if (parsed.length > 0) {
        if (row.id) removedIds.push(row.id);
        expanded.push(...parsed);
        continue;
      }
    }
    expanded.push(row);
  }

  return { rows: expanded, removedIds };
}

export function isBrokenStudentName(name: string): boolean {
  return name.includes("\t") || name.includes("\n") || name.length > 80;
}

/** スプレッドシートからの貼り付け（列: 氏名 / 性別 / 学年 / 塾 / 校舎 / クラス / 志望校 / 開始時成績 / 模試パターン / 課題） */
export function parsePastedStudentRows(text: string): StudentSpreadsheetRow[] {
  const records = splitTsvRecords(
    text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
  );
  const rows: StudentSpreadsheetRow[] = [];

  for (const cells of records) {
    const row = rowFromPastedCells(cells);
    if (row) rows.push(row);
  }

  return rows;
}
