import { and, desc, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { EXAM_DR_CAMPUS_NAMES } from "./constants";
import { getDb } from "./db";
import * as schema from "./db/schema";
import {
  COURSE_PROPOSAL_SUBJECTS,
  createEmptyCourseProposalSubjects,
  isCourseProposalSeason,
  type CourseProposalSeason,
  type CourseProposalSheetData,
  type CourseProposalSubject,
  type CourseProposalSubjectData,
  type CourseProposalSubjects,
} from "./course-proposal-types";
import { resolveProgramSheetDisplayCampus, getTeacherAssignments } from "./programs";
import { getStudentAssignments } from "./students";
import { teacherCanAccessStudent } from "./test-results";

export {
  COURSE_PROPOSAL_SEASON_LABELS,
  COURSE_PROPOSAL_SEASONS,
  COURSE_PROPOSAL_SUBJECTS,
  createEmptyCourseProposalSubjects,
  defaultCourseProposalSeason,
  defaultCourseProposalYear,
  isCourseProposalSeason,
  type CourseProposalSeason,
  type CourseProposalSheetData,
  type CourseProposalSubject,
  type CourseProposalSubjectData,
  type CourseProposalSubjects,
} from "./course-proposal-types";

function parseSubjectsJson(raw: string | null | undefined): CourseProposalSubjects {
  const empty = createEmptyCourseProposalSubjects();
  if (!raw?.trim()) return empty;

  try {
    const parsed = JSON.parse(raw) as Partial<
      Record<CourseProposalSubject, Partial<CourseProposalSubjectData>>
    >;
    for (const subject of COURSE_PROPOSAL_SUBJECTS) {
      const row = parsed[subject];
      if (!row) continue;
      empty[subject] = {
        advice: row.advice?.trim() ?? "",
        sessionCount: row.sessionCount?.trim() ?? "",
        teacherName: row.teacherName?.trim() ?? "",
      };
    }
  } catch {
    return empty;
  }

  return empty;
}

function serializeSubjectsJson(subjects: CourseProposalSubjects): string {
  return JSON.stringify(subjects);
}

function defaultTeacherNamesForStudent(studentId: string): Partial<
  Record<CourseProposalSubject, string>
> {
  const assignments = getStudentAssignments(studentId);
  const names: Partial<Record<CourseProposalSubject, string>> = {};

  for (const assignment of assignments) {
    if (!(COURSE_PROPOSAL_SUBJECTS as readonly string[]).includes(assignment.subject)) {
      continue;
    }
    const teacherName = assignment.teacherName?.trim() ?? "";
    if (!teacherName) continue;
    names[assignment.subject as CourseProposalSubject] = teacherName;
  }

  return names;
}

function applyAssignmentTeacherNames(
  subjects: CourseProposalSubjects,
  studentId: string,
): CourseProposalSubjects {
  const defaults = defaultTeacherNamesForStudent(studentId);
  const next = { ...subjects };

  for (const subject of COURSE_PROPOSAL_SUBJECTS) {
    next[subject] = {
      ...next[subject],
      teacherName: defaults[subject] ?? "",
    };
  }

  return next;
}

export function canEditAllCourseProposalSubjects(
  memberRole: string | undefined,
  accessRole: "admin" | "teacher",
): boolean {
  if (accessRole === "admin") return true;
  return memberRole === "管理者" || memberRole === "校長";
}

export function userCanEditCourseProposalSubject(
  studentId: string,
  subject: CourseProposalSubject,
  userId: string,
  memberRole: string | undefined,
  accessRole: "admin" | "teacher",
): boolean {
  if (canEditAllCourseProposalSubjects(memberRole, accessRole)) return true;

  const db = getDb();
  const assignment = db
    .select({ id: schema.studentAssignments.id })
    .from(schema.studentAssignments)
    .where(
      and(
        eq(schema.studentAssignments.studentId, studentId),
        eq(schema.studentAssignments.subject, subject),
        eq(schema.studentAssignments.teacherId, userId),
      ),
    )
    .get();
  return Boolean(assignment);
}

export function getCourseProposalEditableSubjects(
  studentId: string,
  userId: string,
  memberRole: string | undefined,
  accessRole: "admin" | "teacher",
): Record<CourseProposalSubject, boolean> {
  return Object.fromEntries(
    COURSE_PROPOSAL_SUBJECTS.map((subject) => [
      subject,
      userCanEditCourseProposalSubject(
        studentId,
        subject,
        userId,
        memberRole,
        accessRole,
      ),
    ]),
  ) as Record<CourseProposalSubject, boolean>;
}

function getStudentProgramSheetCampuses(
  studentId: string,
  studentCampus: string | null | undefined,
): string[] {
  const db = getDb();
  const assignments = getStudentAssignments(studentId);
  const campusSet = new Set<string>();
  const campusOrder = new Map(
    EXAM_DR_CAMPUS_NAMES.map((name, index) => [name, index]),
  );

  for (const subject of COURSE_PROPOSAL_SUBJECTS) {
    const assignment = assignments.find((row) => row.subject === subject);
    if (!assignment) continue;

    const sheet = db
      .select({ campus: schema.programSheets.campus })
      .from(schema.programSheets)
      .where(
        and(
          eq(schema.programSheets.studentId, studentId),
          eq(schema.programSheets.subject, subject),
          eq(schema.programSheets.teacherId, assignment.teacherId),
        ),
      )
      .orderBy(desc(schema.programSheets.updatedAt))
      .get();

    const teacher = db
      .select({ defaultCampus: schema.users.defaultCampus })
      .from(schema.users)
      .where(eq(schema.users.id, assignment.teacherId))
      .get();

    const campus = resolveProgramSheetDisplayCampus(
      sheet?.campus,
      teacher?.defaultCampus,
      studentCampus,
    );
    if (campus) campusSet.add(campus);
  }

  return [...campusSet].sort((a, b) => {
    const aIdx =
      campusOrder.get(a as (typeof EXAM_DR_CAMPUS_NAMES)[number]) ?? 999;
    const bIdx =
      campusOrder.get(b as (typeof EXAM_DR_CAMPUS_NAMES)[number]) ?? 999;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.localeCompare(b, "ja");
  });
}

function mapSheetRow(
  row: typeof schema.courseProposalSheets.$inferSelect,
  student: typeof schema.students.$inferSelect,
): CourseProposalSheetData {
  return {
    id: row.id,
    studentId: row.studentId,
    teacherId: row.teacherId,
    year: row.year,
    season: row.season as CourseProposalSeason,
    subjects: applyAssignmentTeacherNames(
      parseSubjectsJson(row.subjectsJson),
      row.studentId,
    ),
    student: {
      name: student.name,
      gender: student.gender,
      grade: student.grade,
    },
    teacherCampuses: getStudentProgramSheetCampuses(
      row.studentId,
      student.campus,
    ),
    editableSubjects: Object.fromEntries(
      COURSE_PROPOSAL_SUBJECTS.map((subject) => [subject, false]),
    ) as Record<CourseProposalSubject, boolean>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function userCanAccessCourseProposalSheet(
  sheetId: string,
  userId: string,
  memberRole: string | undefined,
  accessRole: "admin" | "teacher",
): boolean {
  if (accessRole === "admin") return true;
  if (memberRole === "管理者" || memberRole === "校長") return true;

  const db = getDb();
  const sheet = db
    .select({ studentId: schema.courseProposalSheets.studentId })
    .from(schema.courseProposalSheets)
    .where(eq(schema.courseProposalSheets.id, sheetId))
    .get();
  if (!sheet) return false;

  return teacherCanAccessStudent(userId, sheet.studentId);
}

export function getCourseProposalSheet(
  sheetId: string,
): CourseProposalSheetData | null {
  const db = getDb();
  const row = db
    .select()
    .from(schema.courseProposalSheets)
    .where(eq(schema.courseProposalSheets.id, sheetId))
    .get();
  if (!row) return null;

  const student = db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, row.studentId))
    .get();
  if (!student) return null;

  return mapSheetRow(row, student);
}

export function getCourseProposalSheetForUser(
  sheetId: string,
  userId: string,
  memberRole: string | undefined,
  accessRole: "admin" | "teacher",
): CourseProposalSheetData | null {
  const sheet = getCourseProposalSheet(sheetId);
  if (!sheet) return null;

  return {
    ...sheet,
    editableSubjects: getCourseProposalEditableSubjects(
      sheet.studentId,
      userId,
      memberRole,
      accessRole,
    ),
  };
}

export function findOrCreateCourseProposalSheet(input: {
  studentId: string;
  teacherId: string;
  year: number;
  season: CourseProposalSeason;
}): CourseProposalSheetData {
  const db = getDb();
  const student = db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, input.studentId))
    .get();
  if (!student) {
    throw new Error("Student not found");
  }

  const existing = db
    .select()
    .from(schema.courseProposalSheets)
    .where(
      and(
        eq(schema.courseProposalSheets.studentId, input.studentId),
        eq(schema.courseProposalSheets.year, input.year),
        eq(schema.courseProposalSheets.season, input.season),
      ),
    )
    .get();

  if (existing) {
    return mapSheetRow(existing, student);
  }

  const now = new Date().toISOString();
  const subjects = applyAssignmentTeacherNames(
    createEmptyCourseProposalSubjects(),
    input.studentId,
  );
  const id = uuid();

  db.insert(schema.courseProposalSheets)
    .values({
      id,
      studentId: input.studentId,
      teacherId: input.teacherId,
      year: input.year,
      season: input.season,
      subjectsJson: serializeSubjectsJson(subjects),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const created = db
    .select()
    .from(schema.courseProposalSheets)
    .where(eq(schema.courseProposalSheets.id, id))
    .get();
  if (!created) {
    throw new Error("Failed to create course proposal sheet");
  }

  return mapSheetRow(created, student);
}

export function saveCourseProposalSheet(
  sheetId: string,
  subjects: CourseProposalSubjects,
  editor: {
    userId: string;
    memberRole: string | undefined;
    accessRole: "admin" | "teacher";
  },
): boolean {
  const db = getDb();
  const existing = getCourseProposalSheet(sheetId);
  if (!existing) return false;

  const merged = { ...existing.subjects };
  for (const subject of COURSE_PROPOSAL_SUBJECTS) {
    if (
      userCanEditCourseProposalSubject(
        existing.studentId,
        subject,
        editor.userId,
        editor.memberRole,
        editor.accessRole,
      )
    ) {
      merged[subject] = subjects[subject];
    }
  }

  const now = new Date().toISOString();
  const subjectsToSave = applyAssignmentTeacherNames(merged, existing.studentId);

  const result = db
    .update(schema.courseProposalSheets)
    .set({
      subjectsJson: serializeSubjectsJson(subjectsToSave),
      updatedAt: now,
    })
    .where(eq(schema.courseProposalSheets.id, sheetId))
    .run();

  return result.changes > 0;
}

export function recordCourseProposalPdfExport(sheetId: string): string {
  const db = getDb();
  const now = new Date().toISOString();
  db.update(schema.courseProposalSheets)
    .set({ pdfExportedAt: now, updatedAt: now })
    .where(eq(schema.courseProposalSheets.id, sheetId))
    .run();
  return now;
}

function findCourseProposalSheetRowByStudentYearSeason(
  studentId: string,
  year: number,
  season: CourseProposalSeason,
) {
  const db = getDb();
  return db
    .select()
    .from(schema.courseProposalSheets)
    .where(
      and(
        eq(schema.courseProposalSheets.studentId, studentId),
        eq(schema.courseProposalSheets.year, year),
        eq(schema.courseProposalSheets.season, season),
      ),
    )
    .get();
}

export type BulkCourseProposalPdfStudentStatus = {
  studentId: string;
  sheetId: string | null;
  pdfExportedAt: string | null;
};

export function getBulkCourseProposalPdfStudentStatuses(
  teacherId: string,
  year: number,
  season: CourseProposalSeason,
): BulkCourseProposalPdfStudentStatus[] {
  const db = getDb();
  const assignments = getTeacherAssignments(teacherId);
  const seen = new Set<string>();
  const statuses: BulkCourseProposalPdfStudentStatus[] = [];

  for (const assignment of assignments) {
    if (seen.has(assignment.studentId)) continue;
    seen.add(assignment.studentId);

    const student = db
      .select({ graduatedAt: schema.students.graduatedAt })
      .from(schema.students)
      .where(eq(schema.students.id, assignment.studentId))
      .get();
    if (!student || student.graduatedAt) continue;

    const sheet = findCourseProposalSheetRowByStudentYearSeason(
      assignment.studentId,
      year,
      season,
    );

    statuses.push({
      studentId: assignment.studentId,
      sheetId: sheet?.id ?? null,
      pdfExportedAt: sheet?.pdfExportedAt ?? null,
    });
  }

  return statuses;
}
