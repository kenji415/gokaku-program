import { eq, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import * as schema from "./db/schema";
import {
  isStudentRowEmpty,
  parsePastedStudentRows,
  type StudentSpreadsheetRow,
} from "./student-spreadsheet-utils";
import {
  compactStudentName,
  normalizeStudentName,
  studentNamesMatch,
} from "./student-name";

export type StudentInput = {
  name: string;
  gender?: string;
  grade: string;
  cramSchool?: string;
  campus?: string;
  className?: string;
  mockExamPattern?: string;
  targetSchool?: string;
  initialMockExams?: string;
  initialChallenges?: string;
  goal?: string;
  startDate?: string;
};

export type AssignmentInput = {
  subject: string;
  teacherId: string;
};

export function listStudents() {
  const db = getDb();
  return db.select().from(schema.students).all();
}

export function findStudentByExactName(name: string) {
  const target = compactStudentName(name);
  if (!target) return null;
  const db = getDb();
  return (
    db
      .select()
      .from(schema.students)
      .all()
      .find((student) => studentNamesMatch(student.name, name)) ?? null
  );
}

export function getStudent(id: string) {
  const db = getDb();
  return db.select().from(schema.students).where(eq(schema.students.id, id)).get();
}

export function getStudentAssignments(studentId: string) {
  const db = getDb();
  return db
    .select({
      id: schema.studentAssignments.id,
      subject: schema.studentAssignments.subject,
      teacherId: schema.studentAssignments.teacherId,
      teacherName: schema.users.name,
    })
    .from(schema.studentAssignments)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.studentAssignments.teacherId),
    )
    .where(eq(schema.studentAssignments.studentId, studentId))
    .all();
}

export function createStudent(
  input: StudentInput,
  assignments: AssignmentInput[],
) {
  const db = getDb();
  const studentId = uuid();
  const name = normalizeStudentName(input.name);

  db.insert(schema.students)
    .values({
      id: studentId,
      name,
      gender: input.gender ?? null,
      grade: input.grade,
      cramSchool: input.cramSchool ?? null,
      campus: input.campus ?? null,
      className: input.className ?? null,
      mockExamPattern: input.mockExamPattern ?? null,
      targetSchool: input.targetSchool ?? null,
      initialMockExams: input.initialMockExams ?? null,
      initialChallenges: input.initialChallenges ?? null,
      goal: input.goal ?? "志望校合格に向けて",
      startDate: input.startDate ?? null,
    })
    .run();

  syncAssignments(studentId, assignments);
  return studentId;
}

export function updateStudent(
  studentId: string,
  input: StudentInput,
  assignments: AssignmentInput[],
) {
  const db = getDb();
  const name = normalizeStudentName(input.name);

  db.update(schema.students)
    .set({
      name,
      gender: input.gender ?? null,
      grade: input.grade,
      cramSchool: input.cramSchool ?? null,
      campus: input.campus ?? null,
      className: input.className ?? null,
      mockExamPattern: input.mockExamPattern ?? null,
      targetSchool: input.targetSchool ?? null,
      initialMockExams: input.initialMockExams ?? null,
      initialChallenges: input.initialChallenges ?? null,
      goal: input.goal ?? "志望校合格に向けて",
      startDate: input.startDate ?? null,
    })
    .where(eq(schema.students.id, studentId))
    .run();

  syncAssignments(studentId, assignments);
}

type StudentDb = Pick<ReturnType<typeof getDb>, "select" | "delete">;

function deleteStudentDependencies(db: StudentDb, studentId: string) {
  const sheets = db
    .select({ id: schema.programSheets.id })
    .from(schema.programSheets)
    .where(eq(schema.programSheets.studentId, studentId))
    .all();

  for (const sheet of sheets) {
    const months = db
      .select({ id: schema.programMonths.id })
      .from(schema.programMonths)
      .where(eq(schema.programMonths.sheetId, sheet.id))
      .all();

    for (const month of months) {
      db.delete(schema.programMonthTests)
        .where(eq(schema.programMonthTests.programMonthId, month.id))
        .run();
    }

    db.delete(schema.programMonths)
      .where(eq(schema.programMonths.sheetId, sheet.id))
      .run();
    db.delete(schema.programSheets)
      .where(eq(schema.programSheets.id, sheet.id))
      .run();
  }

  db.delete(schema.studentMonthTests)
    .where(eq(schema.studentMonthTests.studentId, studentId))
    .run();

  db.delete(schema.studentTestResults)
    .where(eq(schema.studentTestResults.studentId, studentId))
    .run();

  db.delete(schema.studentAssignments)
    .where(eq(schema.studentAssignments.studentId, studentId))
    .run();
}

export function deleteStudent(studentId: string) {
  const db = getDb();
  deleteStudentDependencies(db, studentId);
  db.delete(schema.students)
    .where(eq(schema.students.id, studentId))
    .run();
}

function syncAssignments(studentId: string, assignments: AssignmentInput[]) {
  const db = getDb();

  db.delete(schema.studentAssignments)
    .where(eq(schema.studentAssignments.studentId, studentId))
    .run();

  for (const a of assignments) {
    if (!a.teacherId) continue;
    db.insert(schema.studentAssignments)
      .values({
        id: uuid(),
        studentId,
        teacherId: a.teacherId,
        subject: a.subject,
      })
      .run();
  }
}

export function listTeachers() {
  const db = getDb();
  return db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      loginId: schema.users.loginId,
      role: schema.users.role,
      memberRole: schema.users.memberRole,
    })
    .from(schema.users)
    .all()
    .filter(
      (user) =>
        user.loginId !== "admin" &&
        (user.memberRole != null || user.role === "teacher"),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "ja"))
    .map(({ id, name }) => ({ id, name }));
}

/** 氏名欄に表全体が入った壊れたレコードを削除し、個別生徒として補完 */
export function repairBrokenStudentsInDb(): number {
  const db = getDb();
  const brokenProbe = db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(sql`instr(${schema.students.name}, char(9)) > 0`)
    .limit(1)
    .get();
  if (!brokenProbe) return 0;

  const broken = db
    .select()
    .from(schema.students)
    .all()
    .filter((s) => s.name.includes("\t"));
  if (broken.length === 0) return 0;

  let repaired = 0;
  for (const bad of broken) {
    const parsed = parsePastedStudentRows(bad.name);
    if (parsed.length === 0) continue;

    db.transaction((tx) => {
      deleteStudentDependencies(tx, bad.id);
      tx.delete(schema.students).where(eq(schema.students.id, bad.id)).run();

      const existingNames = new Set(
        tx
          .select({ name: schema.students.name })
          .from(schema.students)
          .all()
          .map((s) => s.name.trim()),
      );

      for (const row of parsed) {
        const name = row.name.trim();
        if (!name || existingNames.has(name)) continue;

        const studentId = uuid();
        tx.insert(schema.students)
          .values({
            id: studentId,
            name,
            gender: row.gender.trim() || null,
            grade: row.grade.trim(),
            cramSchool: row.cramSchool.trim() || null,
            campus: row.campus.trim() || null,
            className: row.className.trim() || null,
            mockExamPattern: row.mockExamPattern.trim() || null,
            initialChallenges: row.initialChallenges.trim() || null,
            goal: "志望校合格に向けて",
            startDate: null,
          })
          .run();
        existingNames.add(name);
      }
    });

    repaired++;
  }

  return repaired;
}

export function bulkSaveStudents(
  rows: StudentSpreadsheetRow[],
  deletedIds: string[] = [],
): StudentSpreadsheetRow[] {
  const validRows = rows.filter(
    (r) => !isStudentRowEmpty(r) && !r.name.includes("\t") && !r.name.includes("\n"),
  );
  const saved: StudentSpreadsheetRow[] = [];

  const db = getDb();
  db.transaction((tx) => {
    for (const id of deletedIds) {
      deleteStudentDependencies(tx, id);
      tx.delete(schema.students).where(eq(schema.students.id, id)).run();
    }

    for (const row of validRows) {
      const input: StudentInput = {
        name: normalizeStudentName(row.name),
        gender: row.gender.trim() || undefined,
        grade: row.grade.trim(),
        cramSchool: row.cramSchool.trim() || undefined,
        campus: row.campus.trim() || undefined,
        className: row.className.trim() || undefined,
        mockExamPattern: row.mockExamPattern.trim() || undefined,
        targetSchool: row.targetSchool.trim() || undefined,
        initialMockExams: row.initialMockExams.trim() || undefined,
        goal: "志望校合格に向けて",
      };

      const assignments: AssignmentInput[] = Object.entries(row.teachers)
        .filter(([, teacherId]) => teacherId)
        .map(([subject, teacherId]) => ({ subject, teacherId }));

      if (row.id) {
        tx.update(schema.students)
          .set({
            name: input.name,
            gender: input.gender ?? null,
            grade: input.grade,
            cramSchool: input.cramSchool ?? null,
            campus: input.campus ?? null,
            className: input.className ?? null,
            mockExamPattern: input.mockExamPattern ?? null,
            targetSchool: input.targetSchool ?? null,
            initialMockExams: input.initialMockExams ?? null,
            goal: input.goal ?? "志望校合格に向けて",
          })
          .where(eq(schema.students.id, row.id))
          .run();

        tx.delete(schema.studentAssignments)
          .where(eq(schema.studentAssignments.studentId, row.id))
          .run();

        for (const a of assignments) {
          tx.insert(schema.studentAssignments)
            .values({
              id: uuid(),
              studentId: row.id,
              teacherId: a.teacherId,
              subject: a.subject,
            })
            .run();
        }

        saved.push({ ...row, ...input, id: row.id, teachers: row.teachers });
      } else {
        const studentId = uuid();
        tx.insert(schema.students)
          .values({
            id: studentId,
            name: input.name,
            gender: input.gender ?? null,
            grade: input.grade,
            cramSchool: input.cramSchool ?? null,
            campus: input.campus ?? null,
            className: input.className ?? null,
            mockExamPattern: input.mockExamPattern ?? null,
            targetSchool: input.targetSchool ?? null,
            initialMockExams: input.initialMockExams ?? null,
            goal: input.goal ?? "志望校合格に向けて",
            startDate: null,
          })
          .run();

        for (const a of assignments) {
          tx.insert(schema.studentAssignments)
            .values({
              id: uuid(),
              studentId,
              teacherId: a.teacherId,
              subject: a.subject,
            })
            .run();
        }

        saved.push({ ...row, ...input, id: studentId, teachers: row.teachers });
      }
    }
  });

  return saved;
}
