import { and, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { SUBJECTS } from "./constants";
import { getDb } from "./db";
import * as schema from "./db/schema";
import {
  createStudent,
  findStudentByExactName,
  getStudentAssignments,
  listTeachers,
} from "./students";
import { normalizeStudentName } from "./student-name";
import {
  isStudentClassNameLocked,
  syncStudentClassNameFromResults,
} from "./student-class-name";
import type {
  StudentBasicInfo,
  StudentBasicInfoInput,
  StudentSubjectAssignment,
} from "./student-basic-info-types";

export type {
  StudentBasicInfo,
  StudentBasicInfoInput,
  StudentSubjectAssignment,
  TeacherOption,
} from "./student-basic-info-types";

export function createStudentBasicInfoTemplate(): StudentBasicInfo {
  return {
    id: "",
    name: "",
    gender: null,
    grade: "6年",
    cramSchool: "",
    campus: "",
    className: "",
    classNameLocked: false,
    mockExamPattern: "",
    targetSchool: "",
    graduatedAt: null,
    assignments: SUBJECTS.map((subject) => ({
      subject,
      teacherId: "",
      teacherName: "",
    })),
    teacherOptions: listTeachers().map((t) => ({ id: t.id, name: t.name })),
  };
}

export function lookupStudentBasicInfoSummary(name: string) {
  const student = findStudentByExactName(name);
  if (!student) return null;
  return {
    id: student.id,
    name: student.name,
    grade: student.grade,
  };
}

export function createStudentFromBasicInfo(input: {
  name: string;
  gender?: string | null;
  grade: string;
  cramSchool?: string;
  campus?: string;
  className?: string;
  mockExamPattern?: string;
  targetSchool?: string;
  assignments?: { subject: string; teacherId: string }[];
}): string {
  return createStudent(
    {
      name: normalizeStudentName(input.name),
      gender: input.gender?.trim() || undefined,
      grade: input.grade.trim(),
      cramSchool: input.cramSchool?.trim() || undefined,
      campus: input.campus?.trim() || undefined,
      className: input.className?.trim() || undefined,
      mockExamPattern: input.mockExamPattern?.trim() || undefined,
      targetSchool: input.targetSchool?.trim() || undefined,
      goal: "志望校合格に向けて",
    },
    (input.assignments ?? []).filter((row) => row.teacherId.trim()),
  );
}

function buildAssignments(studentId: string): StudentSubjectAssignment[] {
  const existing = getStudentAssignments(studentId);
  const bySubject = new Map(existing.map((a) => [a.subject, a]));

  const base = SUBJECTS.map((subject) => {
    const row = bySubject.get(subject);
    return {
      subject,
      teacherId: row?.teacherId ?? "",
      teacherName: row?.teacherName ?? "",
    };
  });

  const extras = existing
    .filter((row) => !(SUBJECTS as readonly string[]).includes(row.subject))
    .map((row) => ({
      subject: row.subject,
      teacherId: row.teacherId,
      teacherName: row.teacherName,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject, "ja"));

  return [...base, ...extras];
}

export function getStudentBasicInfo(
  studentId: string,
): StudentBasicInfo | null {
  const db = getDb();
  const student = db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, studentId))
    .get();

  if (!student) return null;

  const className = syncStudentClassNameFromResults(studentId);
  const refreshed = db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, studentId))
    .get();
  if (!refreshed) return null;

  return {
    id: refreshed.id,
    name: refreshed.name,
    gender: refreshed.gender,
    grade: refreshed.grade,
    cramSchool: refreshed.cramSchool ?? "",
    campus: refreshed.campus ?? "",
    className,
    classNameLocked: isStudentClassNameLocked(refreshed.classNameLocked),
    mockExamPattern: refreshed.mockExamPattern ?? "",
    targetSchool: refreshed.targetSchool ?? "",
    graduatedAt: refreshed.graduatedAt ?? null,
    assignments: buildAssignments(studentId),
    teacherOptions: listTeachers().map((t) => ({ id: t.id, name: t.name })),
  };
}

function syncStudentAssignments(
  studentId: string,
  assignments: { subject: string; teacherId: string }[],
) {
  const db = getDb();
  const existing = getStudentAssignments(studentId);
  const now = new Date().toISOString();

  db.delete(schema.studentAssignments)
    .where(eq(schema.studentAssignments.studentId, studentId))
    .run();

  for (const assignment of assignments) {
    const teacherId = assignment.teacherId.trim();
    if (!teacherId) continue;

    db.insert(schema.studentAssignments)
      .values({
        id: uuid(),
        studentId,
        teacherId,
        subject: assignment.subject,
      })
      .run();

    const prev = existing.find((row) => row.subject === assignment.subject);
    if (prev?.teacherId === teacherId) continue;

    db.update(schema.programSheets)
      .set({ teacherId, updatedAt: now })
      .where(
        and(
          eq(schema.programSheets.studentId, studentId),
          eq(schema.programSheets.subject, assignment.subject),
        ),
      )
      .run();
  }
}

export function patchStudentBasicInfo(
  studentId: string,
  input: StudentBasicInfoInput,
) {
  const db = getDb();

  const patch = {
    name:
      input.name !== undefined
        ? normalizeStudentName(input.name) || undefined
        : undefined,
    gender:
      input.gender !== undefined
        ? (input.gender?.trim() || null)
        : undefined,
    grade:
      input.grade !== undefined ? input.grade.trim() || undefined : undefined,
    cramSchool:
      input.cramSchool !== undefined
        ? input.cramSchool.trim() || null
        : undefined,
    campus:
      input.campus !== undefined ? input.campus.trim() || null : undefined,
    className:
      input.className !== undefined
        ? input.className.trim() || null
        : undefined,
    classNameLocked: input.classNameLocked === true ? 1 : undefined,
    mockExamPattern:
      input.mockExamPattern !== undefined
        ? input.mockExamPattern.trim() || null
        : undefined,
    targetSchool:
      input.targetSchool !== undefined
        ? input.targetSchool.trim() || null
        : undefined,
  };

  const values = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(values).length > 0) {
    db.update(schema.students)
      .set(values)
      .where(eq(schema.students.id, studentId))
      .run();
  }

  if (input.assignments !== undefined) {
    syncStudentAssignments(studentId, input.assignments);
  }
}

export function assignSelfToStudentSubject(
  studentId: string,
  teacherId: string,
  subject: string,
  force = false,
):
  | { status: "ok" }
  | { status: "taken"; teacherName: string }
  | { status: "not-found" } {
  const db = getDb();
  const student = db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(eq(schema.students.id, studentId))
    .get();
  if (!student) return { status: "not-found" };

  const existing = db
    .select({
      id: schema.studentAssignments.id,
      teacherId: schema.studentAssignments.teacherId,
    })
    .from(schema.studentAssignments)
    .where(
      and(
        eq(schema.studentAssignments.studentId, studentId),
        eq(schema.studentAssignments.subject, subject),
      ),
    )
    .get();

  const now = new Date().toISOString();

  if (existing) {
    if (existing.teacherId === teacherId) return { status: "ok" };
    if (!force) {
      const other = db
        .select({ name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, existing.teacherId))
        .get();
      return { status: "taken", teacherName: other?.name ?? "他の講師" };
    }
    db.update(schema.studentAssignments)
      .set({ teacherId })
      .where(eq(schema.studentAssignments.id, existing.id))
      .run();
  } else {
    db.insert(schema.studentAssignments)
      .values({ id: uuid(), studentId, teacherId, subject })
      .run();
  }

  db.update(schema.programSheets)
    .set({ teacherId, updatedAt: now })
    .where(
      and(
        eq(schema.programSheets.studentId, studentId),
        eq(schema.programSheets.subject, subject),
      ),
    )
    .run();

  return { status: "ok" };
}

export function unassignTeacherFromStudent(
  studentId: string,
  teacherId: string,
): boolean {
  const db = getDb();
  const result = db
    .delete(schema.studentAssignments)
    .where(
      and(
        eq(schema.studentAssignments.studentId, studentId),
        eq(schema.studentAssignments.teacherId, teacherId),
      ),
    )
    .run();

  return result.changes > 0;
}

function teacherHasStudentRelationship(
  studentId: string,
  teacherId: string,
): boolean {
  const db = getDb();
  const assignment = db
    .select({ id: schema.studentAssignments.id })
    .from(schema.studentAssignments)
    .where(
      and(
        eq(schema.studentAssignments.studentId, studentId),
        eq(schema.studentAssignments.teacherId, teacherId),
      ),
    )
    .get();
  if (assignment) return true;

  const sheet = db
    .select({ id: schema.programSheets.id })
    .from(schema.programSheets)
    .where(
      and(
        eq(schema.programSheets.studentId, studentId),
        eq(schema.programSheets.teacherId, teacherId),
      ),
    )
    .get();
  return Boolean(sheet);
}

export function graduateStudent(
  studentId: string,
  teacherId: string,
): boolean {
  const db = getDb();
  const student = db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, studentId))
    .get();

  if (!student || student.graduatedAt) return false;
  if (!teacherHasStudentRelationship(studentId, teacherId)) return false;

  db.update(schema.students)
    .set({
      graduatedAt: new Date().toISOString(),
      graduatedByTeacherId: teacherId,
    })
    .where(eq(schema.students.id, studentId))
    .run();

  return true;
}
