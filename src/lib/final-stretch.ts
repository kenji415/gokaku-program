import { and, asc, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import * as schema from "./db/schema";
import {
  FINAL_STRETCH_MONTHS,
  FINAL_STRETCH_DEFAULT_ROW_COUNTS,
  parseFinalStretchColumnWidths,
  type FinalStretchColumnWidths,
  type FinalStretchMonthKey,
  type FinalStretchRowData,
  type FinalStretchSheetData,
  FINAL_STRETCH_MAX_TOTAL_ROWS,
  isFinalStretchGrade,
} from "./final-stretch-types";
import { getTeacherAssignments } from "./programs";
import { userCanViewProgramSheet } from "./teacher-overview";

export {
  FINAL_STRETCH_MONTHS,
  isFinalStretchGrade,
  type FinalStretchColumnWidths,
  type FinalStretchMonthKey,
  type FinalStretchRowData,
  type FinalStretchSheetData,
} from "./final-stretch-types";

function resolveProgramSheetId(
  studentId: string,
  subject: string,
): string | null {
  const db = getDb();
  const row = db
    .select({ id: schema.programSheets.id })
    .from(schema.programSheets)
    .where(
      and(
        eq(schema.programSheets.studentId, studentId),
        eq(schema.programSheets.subject, subject),
      ),
    )
    .orderBy(asc(schema.programSheets.updatedAt))
    .all()
    .at(-1);
  return row?.id ?? null;
}

function userCanAccessStudentSubject(
  studentId: string,
  subject: string,
  teacherId: string,
  userId: string,
  memberRole: string | undefined,
  accessRole: "admin" | "teacher",
): boolean {
  // 管理者はプログラムシート有無に関わらず担当外を許可
  if (memberRole === "管理者" || accessRole === "admin") return true;

  const programSheetId = resolveProgramSheetId(studentId, subject);
  if (programSheetId) {
    return userCanViewProgramSheet(
      programSheetId,
      userId,
      memberRole,
      accessRole,
    );
  }

  if (teacherId === userId) return true;

  const db = getDb();
  const assignment = db
    .select({ id: schema.studentAssignments.id })
    .from(schema.studentAssignments)
    .where(
      and(
        eq(schema.studentAssignments.teacherId, userId),
        eq(schema.studentAssignments.studentId, studentId),
        eq(schema.studentAssignments.subject, subject),
      ),
    )
    .get();
  return Boolean(assignment);
}

function trimOrEmpty(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function resolveSheetCampus(
  storedCampus: string | null | undefined,
  studentCampus: string | null | undefined,
  teacherDefaultCampus: string | null | undefined,
): string {
  const stored = trimOrEmpty(storedCampus);
  const studentCampusTrim = trimOrEmpty(studentCampus);
  const effectiveStored =
    stored && stored === studentCampusTrim ? "" : stored;
  if (effectiveStored) return effectiveStored;
  return trimOrEmpty(teacherDefaultCampus);
}

function createDefaultRowsForSheet(): FinalStretchRowData[] {
  const rows: FinalStretchRowData[] = [];
  for (const month of FINAL_STRETCH_MONTHS) {
    const count = FINAL_STRETCH_DEFAULT_ROW_COUNTS[month.key];
    for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
      rows.push({
        id: uuid(),
        monthKey: month.key,
        rowIndex,
        measure: "",
        unitTheme: "",
        detail: "",
      });
    }
  }
  return rows;
}

function normalizeRows(rows: FinalStretchRowData[]): FinalStretchRowData[] {
  const normalized: FinalStretchRowData[] = [];

  for (const month of FINAL_STRETCH_MONTHS) {
    const monthRows = rows
      .filter((row) => row.monthKey === month.key)
      .sort((a, b) => a.rowIndex - b.rowIndex);
    const targetCount = Math.max(
      FINAL_STRETCH_DEFAULT_ROW_COUNTS[month.key],
      monthRows.length,
    );

    for (let rowIndex = 0; rowIndex < targetCount; rowIndex += 1) {
      if (normalized.length >= FINAL_STRETCH_MAX_TOTAL_ROWS) {
        return normalized;
      }
      const existing = monthRows[rowIndex];
      normalized.push(
        existing
          ? { ...existing, rowIndex }
          : {
              id: uuid(),
              monthKey: month.key,
              rowIndex,
              measure: "",
              unitTheme: "",
              detail: "",
            },
      );
    }
  }

  return normalized;
}

function mapRow(
  row: typeof schema.finalStretchRows.$inferSelect,
): FinalStretchRowData {
  return {
    id: row.id,
    monthKey: row.monthKey as FinalStretchMonthKey,
    rowIndex: row.rowIndex,
    measure: row.measure ?? "",
    unitTheme: row.unitTheme ?? "",
    detail: row.detail ?? "",
  };
}

export function getFinalStretchSheet(sheetId: string): FinalStretchSheetData | null {
  const db = getDb();
  const sheet = db
    .select()
    .from(schema.finalStretchSheets)
    .where(eq(schema.finalStretchSheets.id, sheetId))
    .get();
  if (!sheet) return null;

  const student = db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, sheet.studentId))
    .get();
  if (!student) return null;

  const teacher = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, sheet.teacherId))
    .get();
  if (!teacher) return null;

  const rows = db
    .select()
    .from(schema.finalStretchRows)
    .where(eq(schema.finalStretchRows.sheetId, sheet.id))
    .orderBy(
      asc(schema.finalStretchRows.monthKey),
      asc(schema.finalStretchRows.rowIndex),
    )
    .all()
    .map(mapRow);

  return {
    id: sheet.id,
    studentId: sheet.studentId,
    subject: sheet.subject,
    teacherId: sheet.teacherId,
    campus: resolveSheetCampus(
      sheet.campus,
      student.campus,
      teacher.defaultCampus,
    ),
    policy: sheet.policy ?? "",
    examDaySimulation: sheet.examDaySimulation ?? "",
    columnWidths: parseFinalStretchColumnWidths(sheet.columnWidths),
    student: {
      name: student.name,
      gender: student.gender,
      grade: student.grade,
      campus: trimOrEmpty(student.campus),
      targetSchool: trimOrEmpty(student.targetSchool),
    },
    teacher: { name: teacher.name },
    rows: normalizeRows(rows),
    updatedAt: sheet.updatedAt,
  };
}

export function findFinalStretchSheetByStudentSubject(
  studentId: string,
  subject: string,
): typeof schema.finalStretchSheets.$inferSelect | null {
  const db = getDb();
  return (
    db
      .select()
      .from(schema.finalStretchSheets)
      .where(
        and(
          eq(schema.finalStretchSheets.studentId, studentId),
          eq(schema.finalStretchSheets.subject, subject),
        ),
      )
      .get() ?? null
  );
}

export function findOrCreateFinalStretchSheet(params: {
  studentId: string;
  subject: string;
  teacherId: string;
}): FinalStretchSheetData {
  const db = getDb();
  const now = new Date().toISOString();

  let sheet = findFinalStretchSheetByStudentSubject(
    params.studentId,
    params.subject,
  );

  if (!sheet) {
    const assignment = db
      .select({ teacherId: schema.studentAssignments.teacherId })
      .from(schema.studentAssignments)
      .where(
        and(
          eq(schema.studentAssignments.studentId, params.studentId),
          eq(schema.studentAssignments.subject, params.subject),
        ),
      )
      .get();
    const sheetTeacherId = assignment?.teacherId ?? params.teacherId;
    const sheetId = uuid();

    db.insert(schema.finalStretchSheets)
      .values({
        id: sheetId,
        studentId: params.studentId,
        subject: params.subject,
        teacherId: sheetTeacherId,
        campus: null,
        policy: "",
        examDaySimulation: "",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    for (const row of createDefaultRowsForSheet()) {
      db.insert(schema.finalStretchRows)
        .values({
          id: row.id,
          sheetId,
          monthKey: row.monthKey,
          rowIndex: row.rowIndex,
          measure: "",
          unitTheme: "",
          detail: "",
        })
        .run();
    }

    sheet = db
      .select()
      .from(schema.finalStretchSheets)
      .where(eq(schema.finalStretchSheets.id, sheetId))
      .get()!;
  }

  const programSheetRow = db
    .select({
      id: schema.programSheets.id,
      campus: schema.programSheets.campus,
    })
    .from(schema.programSheets)
    .where(
      and(
        eq(schema.programSheets.studentId, params.studentId),
        eq(schema.programSheets.subject, params.subject),
      ),
    )
    .orderBy(asc(schema.programSheets.updatedAt))
    .all()
    .at(-1);

  if (
    programSheetRow &&
    trimOrEmpty(sheet.campus) === "" &&
    trimOrEmpty(programSheetRow.campus)
  ) {
    db.update(schema.finalStretchSheets)
      .set({ campus: programSheetRow.campus, updatedAt: now })
      .where(eq(schema.finalStretchSheets.id, sheet.id))
      .run();
  }

  return getFinalStretchSheet(sheet.id)!;
}

export function saveFinalStretchSheet(
  sheetId: string,
  data: {
    campus: string;
    policy: string;
    examDaySimulation: string;
    columnWidths: FinalStretchColumnWidths;
    rows: {
      id: string;
      monthKey: FinalStretchMonthKey;
      rowIndex: number;
      measure: string;
      unitTheme: string;
      detail: string;
    }[];
  },
): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.update(schema.finalStretchSheets)
    .set({
      campus: data.campus || null,
      policy: data.policy,
      examDaySimulation: data.examDaySimulation,
      columnWidths: JSON.stringify(data.columnWidths),
      updatedAt: now,
    })
    .where(eq(schema.finalStretchSheets.id, sheetId))
    .run();

  db.delete(schema.finalStretchRows)
    .where(eq(schema.finalStretchRows.sheetId, sheetId))
    .run();

  for (const row of data.rows) {
    db.insert(schema.finalStretchRows)
      .values({
        id: row.id || uuid(),
        sheetId,
        monthKey: row.monthKey,
        rowIndex: row.rowIndex,
        measure: row.measure,
        unitTheme: row.unitTheme,
        detail: row.detail,
      })
      .run();
  }
}

export function userCanAccessFinalStretchSheet(
  sheetId: string,
  userId: string,
  memberRole: string | undefined,
  accessRole: "admin" | "teacher",
): boolean {
  const sheet = getFinalStretchSheet(sheetId);
  if (!sheet) return false;
  return userCanAccessStudentSubject(
    sheet.studentId,
    sheet.subject,
    sheet.teacherId,
    userId,
    memberRole,
    accessRole,
  );
}

export function userCanAccessFinalStretchByStudentSubject(
  studentId: string,
  subject: string,
  teacherId: string,
  userId: string,
  memberRole: string | undefined,
  accessRole: "admin" | "teacher",
): boolean {
  return userCanAccessStudentSubject(
    studentId,
    subject,
    teacherId,
    userId,
    memberRole,
    accessRole,
  );
}

export function recordFinalStretchPdfExport(sheetId: string): string {
  const db = getDb();
  const now = new Date().toISOString();
  db.update(schema.finalStretchSheets)
    .set({ pdfExportedAt: now, updatedAt: now })
    .where(eq(schema.finalStretchSheets.id, sheetId))
    .run();
  return now;
}

export type BulkFinalStretchPdfStudentStatus = {
  studentId: string;
  sheetId: string | null;
  pdfExportedAt: string | null;
};

export function getBulkFinalStretchPdfStudentStatuses(
  teacherId: string,
  subject: string,
): BulkFinalStretchPdfStudentStatus[] {
  const db = getDb();
  const assignments = getTeacherAssignments(teacherId).filter(
    (assignment) =>
      assignment.subject === subject && isFinalStretchGrade(assignment.grade),
  );

  return assignments.map((assignment) => {
    const sheet = findFinalStretchSheetByStudentSubject(
      assignment.studentId,
      subject,
    );

    return {
      studentId: assignment.studentId,
      sheetId: sheet?.id ?? null,
      pdfExportedAt: sheet?.pdfExportedAt ?? null,
    };
  });
}
