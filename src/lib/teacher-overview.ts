import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./db/schema";
import { buildMonthSlots } from "./months";
import { getProgramSheet } from "./programs";
import { supportsAssignedCampus } from "./member-constants";

export type TeacherOverviewMonthCell = {
  yearMonth: string;
  monthLabel: string;
  filled: boolean;
};

export type TeacherOverviewStudentRow = {
  studentId: string;
  studentName: string;
  grade: string;
  subject: string;
  teacherId: string;
  sheetId: string | null;
  sheetCampus: string;
  months: TeacherOverviewMonthCell[];
};

export type TeacherOverviewTeacherGroup = {
  teacherId: string;
  teacherName: string;
  students: TeacherOverviewStudentRow[];
};

function trimOrEmpty(value: string | null | undefined): string {
  return value?.trim() || "";
}

function resolveDisplayCampus(
  sheetCampus: string | null | undefined,
  teacherDefaultCampus: string | null | undefined,
  studentCampus: string | null | undefined,
): string {
  const stored = trimOrEmpty(sheetCampus);
  const studentCampusTrim = trimOrEmpty(studentCampus);
  const effectiveStored =
    stored && stored === studentCampusTrim ? "" : stored;
  if (effectiveStored) return effectiveStored;
  return trimOrEmpty(teacherDefaultCampus);
}

function monthHasContent(content: string | null | undefined): boolean {
  return Boolean(content?.trim());
}

function getViewerAssignedCampus(userId: string): string | null {
  const db = getDb();
  const viewer = db
    .select({ assignedCampus: schema.users.assignedCampus })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  return viewer?.assignedCampus?.trim() || null;
}

/** 講師別・シート閲覧の校舎絞り込み。null＝全校舎、undefined＝表示不可 */
function resolveCampusScope(
  userId: string,
  memberRole: string | undefined,
): string | null | undefined {
  if (!supportsAssignedCampus(memberRole ?? "")) return null;

  const assignedCampus = getViewerAssignedCampus(userId);
  if (memberRole === "管理者") {
    return assignedCampus;
  }
  if (memberRole === "校長") {
    return assignedCampus ?? undefined;
  }
  return null;
}

function userIsAssignedToSheet(
  userId: string,
  studentId: string,
  subject: string,
): boolean {
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

function userCanAccessCampusScopedSheet(
  sheet: NonNullable<ReturnType<typeof getProgramSheet>>,
  userId: string,
  campusScope: string,
): boolean {
  if (sheet.teacherId === userId) return true;
  if (userIsAssignedToSheet(userId, sheet.studentId, sheet.subject)) {
    return true;
  }
  return sheet.campus === campusScope;
}

export function userCanViewProgramSheet(
  sheetId: string,
  userId: string,
  memberRole: string | undefined,
  accessRole: "admin" | "teacher",
): boolean {
  const sheet = getProgramSheet(sheetId);
  if (!sheet) return false;

  if (memberRole === "管理者") {
    const campusScope = resolveCampusScope(userId, memberRole);
    if (!campusScope) return true;
    return userCanAccessCampusScopedSheet(sheet, userId, campusScope);
  }

  if (memberRole === "校長") {
    const campusScope = resolveCampusScope(userId, memberRole);
    if (!campusScope) return false;
    return userCanAccessCampusScopedSheet(sheet, userId, campusScope);
  }

  if (accessRole === "admin") return true;

  if (sheet.teacherId === userId) return true;

  return userIsAssignedToSheet(userId, sheet.studentId, sheet.subject);
}

export function canViewTeacherOverview(memberRole: string | undefined): boolean {
  return memberRole === "管理者" || memberRole === "校長";
}

export function getTeacherOverview(
  viewerId: string,
  memberRole: string | undefined,
  startYearMonth: string,
): TeacherOverviewTeacherGroup[] {
  if (!canViewTeacherOverview(memberRole)) return [];

  const db = getDb();
  const slots = buildMonthSlots(startYearMonth);
  const yearMonths = slots.map((slot) => slot.yearMonth);

  const campusScope = resolveCampusScope(viewerId, memberRole);
  if (campusScope === undefined) return [];

  const campusFilter = campusScope;

  const assignmentRows = db
    .select({
      teacherId: schema.studentAssignments.teacherId,
      teacherName: schema.users.name,
      teacherDefaultCampus: schema.users.defaultCampus,
      studentId: schema.students.id,
      studentName: schema.students.name,
      grade: schema.students.grade,
      studentCampus: schema.students.campus,
      subject: schema.studentAssignments.subject,
    })
    .from(schema.studentAssignments)
    .innerJoin(
      schema.students,
      eq(schema.students.id, schema.studentAssignments.studentId),
    )
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.studentAssignments.teacherId),
    )
    .where(isNull(schema.students.graduatedAt))
    .all();

  const byTeacher = new Map<string, TeacherOverviewTeacherGroup>();

  for (const row of assignmentRows) {
    const sheet = db
      .select()
      .from(schema.programSheets)
      .where(
        and(
          eq(schema.programSheets.studentId, row.studentId),
          eq(schema.programSheets.subject, row.subject),
          eq(schema.programSheets.teacherId, row.teacherId),
        ),
      )
      .orderBy(desc(schema.programSheets.updatedAt))
      .all()[0];

    const sheetCampus = resolveDisplayCampus(
      sheet?.campus,
      row.teacherDefaultCampus,
      row.studentCampus,
    );

    if (campusFilter && sheetCampus !== campusFilter) continue;

    const allMonthRows =
      sheet && yearMonths.length > 0
        ? db
            .select()
            .from(schema.programMonths)
            .where(eq(schema.programMonths.sheetId, sheet.id))
            .all()
            .filter((m) => yearMonths.includes(m.yearMonth))
        : [];

    const monthByYearMonth = new Map(
      allMonthRows.map((month) => [month.yearMonth, month]),
    );

    const months = slots.map((slot) => {
      const month = monthByYearMonth.get(slot.yearMonth);
      return {
        yearMonth: slot.yearMonth,
        monthLabel: slot.monthLabel,
        filled: monthHasContent(month?.content),
      };
    });

    const studentRow: TeacherOverviewStudentRow = {
      studentId: row.studentId,
      studentName: row.studentName,
      grade: row.grade,
      subject: row.subject,
      teacherId: row.teacherId,
      sheetId: sheet?.id ?? null,
      sheetCampus,
      months,
    };

    const group = byTeacher.get(row.teacherId);
    if (!group) {
      byTeacher.set(row.teacherId, {
        teacherId: row.teacherId,
        teacherName: row.teacherName,
        students: [studentRow],
      });
      continue;
    }
    group.students.push(studentRow);
  }

  return [...byTeacher.values()]
    .map((group) => ({
      ...group,
      students: group.students.sort((a, b) =>
        a.studentName.localeCompare(b.studentName, "ja"),
      ),
    }))
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName, "ja"));
}
