import { and, asc, eq } from "drizzle-orm";
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
import { syncStudentMonthTestsToCurrentGrade } from "./programs";
import type {
  StudentBasicInfo,
  StudentBasicInfoInput,
  StudentSubjectAssignment,
} from "./student-basic-info-types";
import {
  SUBJECT_TEACHER_SLOTS,
} from "./student-basic-info-types";

export type {
  StudentBasicInfo,
  StudentBasicInfoInput,
  StudentSubjectAssignment,
  TeacherOption,
} from "./student-basic-info-types";
export { assignmentSlotLabel, SUBJECT_TEACHER_SLOTS } from "./student-basic-info-types";

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
    assignments: SUBJECTS.flatMap((subject) =>
      SUBJECT_TEACHER_SLOTS.map((slot) => ({
        subject,
        slot,
        teacherId: "",
        teacherName: "",
      })),
    ),
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
  const bySubject = new Map<string, typeof existing>();
  for (const row of existing) {
    const list = bySubject.get(row.subject) ?? [];
    list.push(row);
    bySubject.set(row.subject, list);
  }

  const base = SUBJECTS.flatMap((subject) => {
    const rows = bySubject.get(subject) ?? [];
    const bySlot = new Map(rows.map((row) => [row.slot, row]));
    return SUBJECT_TEACHER_SLOTS.map((slot) => {
      const row = bySlot.get(slot);
      return {
        subject,
        slot,
        teacherId: row?.teacherId ?? "",
        teacherName: row?.teacherName ?? "",
      };
    });
  });

  const extras = existing
    .filter((row) => !(SUBJECTS as readonly string[]).includes(row.subject))
    .map((row) => ({
      subject: row.subject,
      slot: (row.slot === 2 ? 2 : 1) as 1 | 2,
      teacherId: row.teacherId,
      teacherName: row.teacherName,
    }))
    .sort((a, b) => {
      const subjectCmp = a.subject.localeCompare(b.subject, "ja");
      if (subjectCmp !== 0) return subjectCmp;
      return a.slot - b.slot;
    });

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
  assignments: { subject: string; teacherId: string; slot?: 1 | 2 }[],
) {
  const db = getDb();
  const now = new Date().toISOString();

  const nextRows: { subject: string; teacherId: string; slot: 1 | 2 }[] = [];
  const seenTeacherSubject = new Set<string>();
  const usedSlot = new Set<string>();

  for (const assignment of assignments) {
    const subject = assignment.subject.trim();
    const teacherId = assignment.teacherId.trim();
    if (!subject || !teacherId) continue;
    const teacherKey = `${subject}\0${teacherId}`;
    if (seenTeacherSubject.has(teacherKey)) continue;

    let slot: 1 | 2 = assignment.slot === 2 ? 2 : 1;
    const slotKey = `${subject}\0${slot}`;
    if (usedSlot.has(slotKey)) {
      slot = slot === 1 ? 2 : 1;
    }
    const resolvedSlotKey = `${subject}\0${slot}`;
    if (usedSlot.has(resolvedSlotKey)) continue;

    seenTeacherSubject.add(teacherKey);
    usedSlot.add(resolvedSlotKey);
    nextRows.push({ subject, teacherId, slot });
  }

  // スロット順に並べてから保存（連名・主担当の一貫性）
  nextRows.sort((a, b) => {
    const subjectCmp = a.subject.localeCompare(b.subject, "ja");
    if (subjectCmp !== 0) return subjectCmp;
    return a.slot - b.slot;
  });

  db.delete(schema.studentAssignments)
    .where(eq(schema.studentAssignments.studentId, studentId))
    .run();

  for (const row of nextRows) {
    db.insert(schema.studentAssignments)
      .values({
        id: uuid(),
        studentId,
        teacherId: row.teacherId,
        subject: row.subject,
        slot: row.slot,
      })
      .run();
  }

  const teachersBySubject = new Map<string, string[]>();
  for (const row of nextRows) {
    const list = teachersBySubject.get(row.subject) ?? [];
    list.push(row.teacherId);
    teachersBySubject.set(row.subject, list);
  }

  for (const [subject, teacherIds] of teachersBySubject) {
    const primaryTeacherId = teacherIds[0];
    const sheets = db
      .select({
        id: schema.programSheets.id,
        teacherId: schema.programSheets.teacherId,
      })
      .from(schema.programSheets)
      .where(
        and(
          eq(schema.programSheets.studentId, studentId),
          eq(schema.programSheets.subject, subject),
        ),
      )
      .all();

    for (const sheet of sheets) {
      if (teacherIds.includes(sheet.teacherId)) continue;
      db.update(schema.programSheets)
        .set({ teacherId: primaryTeacherId, updatedAt: now })
        .where(eq(schema.programSheets.id, sheet.id))
        .run();
    }
  }
}

export function patchStudentBasicInfo(
  studentId: string,
  input: StudentBasicInfoInput,
) {
  const db = getDb();

  const before =
    input.grade !== undefined || input.mockExamPattern !== undefined
      ? db
          .select({
            grade: schema.students.grade,
            mockExamPattern: schema.students.mockExamPattern,
          })
          .from(schema.students)
          .where(eq(schema.students.id, studentId))
          .get()
      : null;

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

  const gradeChanged =
    input.grade !== undefined &&
    (before?.grade?.trim() ?? "") !== (input.grade.trim() || "");
  const patternChanged =
    input.mockExamPattern !== undefined &&
    (before?.mockExamPattern?.trim() ?? "") !==
      (input.mockExamPattern.trim() || "");

  if (gradeChanged || patternChanged) {
    syncStudentMonthTestsToCurrentGrade(studentId);
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

  const existingAll = db
    .select({
      id: schema.studentAssignments.id,
      teacherId: schema.studentAssignments.teacherId,
      slot: schema.studentAssignments.slot,
    })
    .from(schema.studentAssignments)
    .where(
      and(
        eq(schema.studentAssignments.studentId, studentId),
        eq(schema.studentAssignments.subject, subject),
      ),
    )
    .orderBy(asc(schema.studentAssignments.slot))
    .all();

  const now = new Date().toISOString();

  if (existingAll.some((row) => row.teacherId === teacherId)) {
    return { status: "ok" };
  }

  const usedSlots = new Set(existingAll.map((row) => row.slot));
  const nextSlot: 1 | 2 = usedSlots.has(1) ? 2 : 1;

  if (existingAll.length < 2) {
    db.insert(schema.studentAssignments)
      .values({ id: uuid(), studentId, teacherId, subject, slot: nextSlot })
      .run();
    if (nextSlot === 1) {
      db.update(schema.programSheets)
        .set({ teacherId, updatedAt: now })
        .where(
          and(
            eq(schema.programSheets.studentId, studentId),
            eq(schema.programSheets.subject, subject),
          ),
        )
        .run();
    }
    return { status: "ok" };
  }

  if (!force) {
    const other = db
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, existingAll[0].teacherId))
      .get();
    return { status: "taken", teacherName: other?.name ?? "他の講師" };
  }

  // force: スロット1を入れ替え（左＝担当1）
  const slot1 = existingAll.find((row) => row.slot === 1) ?? existingAll[0];
  db.update(schema.studentAssignments)
    .set({ teacherId })
    .where(eq(schema.studentAssignments.id, slot1.id))
    .run();

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
