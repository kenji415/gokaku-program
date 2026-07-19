import { and, desc, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { EXAM_DR_CAMPUS_NAMES } from "./constants";
import { getDb } from "./db";
import * as schema from "./db/schema";
import {
  COURSE_PROPOSAL_SUBJECTS,
  createEmptySubjectData,
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

type StoredCourseProposal = {
  slots: CourseProposalSubject[];
  subjects: CourseProposalSubjects;
};

function getAvailableSubjects(studentId: string): CourseProposalSubject[] {
  const subjects = [...COURSE_PROPOSAL_SUBJECTS] as CourseProposalSubject[];
  for (const assignment of getStudentAssignments(studentId)) {
    const subject = assignment.subject.trim();
    if (subject && !subjects.includes(subject)) subjects.push(subject);
  }
  return subjects;
}

export function parseCourseProposalSubjectsJson(
  raw: string | null | undefined,
): { slots: CourseProposalSubject[]; subjects: CourseProposalSubjects } {
  const fallback = {
    slots: [...COURSE_PROPOSAL_SUBJECTS],
    subjects: createEmptyCourseProposalSubjects(),
  };
  if (!raw?.trim()) return fallback;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fallback;
    }
    const record = parsed as Record<string, unknown>;
    const subjectRecord =
      record.subjects &&
      typeof record.subjects === "object" &&
      !Array.isArray(record.subjects)
        ? (record.subjects as Record<string, unknown>)
        : record;
    const subjects = createEmptyCourseProposalSubjects();

    for (const [subject, value] of Object.entries(subjectRecord)) {
      if (!subject.trim() || !value || typeof value !== "object") continue;
      const row = value as Partial<CourseProposalSubjectData>;
      subjects[subject] = {
        advice: typeof row.advice === "string" ? row.advice : "",
        sessionCount:
          typeof row.sessionCount === "string" ? row.sessionCount : "",
        teacherName:
          typeof row.teacherName === "string" ? row.teacherName.trim() : "",
      };
    }

    const slots = Array.isArray(record.slots)
      ? record.slots.filter(
          (subject): subject is string =>
            typeof subject === "string" && Boolean(subject.trim()),
        )
      : [...COURSE_PROPOSAL_SUBJECTS];
    return { slots, subjects };
  } catch {
    return fallback;
  }
}

function normalizeSubjectSlots(
  slots: readonly string[],
  availableSubjects: readonly string[],
): CourseProposalSubject[] {
  const available = new Set(availableSubjects);
  const normalized: string[] = [];
  for (const subject of [
    ...slots,
    ...COURSE_PROPOSAL_SUBJECTS,
    ...availableSubjects,
  ]) {
    if (
      available.has(subject) &&
      !normalized.includes(subject) &&
      normalized.length < COURSE_PROPOSAL_SUBJECTS.length
    ) {
      normalized.push(subject);
    }
  }
  return normalized;
}

function serializeSubjectsJson(data: StoredCourseProposal): string {
  return JSON.stringify(data);
}

function defaultTeacherNamesForStudent(
  studentId: string,
): Partial<Record<string, string>> {
  const assignments = getStudentAssignments(studentId);
  const names: Partial<Record<CourseProposalSubject, string>> = {};

  for (const assignment of assignments) {
    const teacherName = assignment.teacherName?.trim() ?? "";
    if (!teacherName) continue;
    names[assignment.subject] = teacherName;
  }

  return names;
}

function applyAssignmentTeacherNames(
  subjects: CourseProposalSubjects,
  studentId: string,
): CourseProposalSubjects {
  const defaults = defaultTeacherNamesForStudent(studentId);
  const next = { ...subjects };
  const allSubjects = new Set([
    ...Object.keys(subjects),
    ...getAvailableSubjects(studentId),
  ]);

  for (const subject of allSubjects) {
    next[subject] = {
      ...(next[subject] ?? createEmptySubjectData()),
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
): Record<string, boolean> {
  const subjects = getAvailableSubjects(studentId);
  return Object.fromEntries(
    subjects.map((subject) => [
      subject,
      userCanEditCourseProposalSubject(
        studentId,
        subject,
        userId,
        memberRole,
        accessRole,
      ),
    ]),
  );
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

  for (const assignment of assignments) {
    const subject = assignment.subject;

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
  const availableSubjects = getAvailableSubjects(row.studentId);
  const stored = parseCourseProposalSubjectsJson(row.subjectsJson);
  const subjects = applyAssignmentTeacherNames(
    {
      ...stored.subjects,
      ...Object.fromEntries(
        availableSubjects.map((subject) => [
          subject,
          stored.subjects[subject] ?? createEmptySubjectData(),
        ]),
      ),
    },
    row.studentId,
  );

  return {
    id: row.id,
    studentId: row.studentId,
    teacherId: row.teacherId,
    year: row.year,
    season: row.season as CourseProposalSeason,
    subjectSlots: normalizeSubjectSlots(stored.slots, availableSubjects),
    availableSubjects,
    subjects,
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
      availableSubjects.map((subject) => [subject, false]),
    ),
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
      subjectsJson: serializeSubjectsJson({
        slots: [...COURSE_PROPOSAL_SUBJECTS],
        subjects,
      }),
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
  subjectSlots: CourseProposalSubject[],
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
  for (const subject of existing.availableSubjects) {
    if (
      userCanEditCourseProposalSubject(
        existing.studentId,
        subject,
        editor.userId,
        editor.memberRole,
        editor.accessRole,
      )
    ) {
      const submitted = subjects[subject];
      if (submitted) {
        merged[subject] = {
          advice:
            typeof submitted.advice === "string" ? submitted.advice : "",
          sessionCount:
            typeof submitted.sessionCount === "string"
              ? submitted.sessionCount
              : "",
          teacherName: existing.subjects[subject]?.teacherName ?? "",
        };
      }
    }
  }

  const now = new Date().toISOString();
  const subjectsToSave = applyAssignmentTeacherNames(merged, existing.studentId);

  const result = db
    .update(schema.courseProposalSheets)
    .set({
      subjectsJson: serializeSubjectsJson({
        slots: normalizeSubjectSlots(
          Array.isArray(subjectSlots) ? subjectSlots : existing.subjectSlots,
          existing.availableSubjects,
        ),
        subjects: subjectsToSave,
      }),
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
