import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./db/schema";
import {
  COURSE_PROPOSAL_SUBJECTS,
  type CourseProposalSeason,
  type CourseProposalSubject,
  type CourseProposalSubjectData,
} from "./course-proposal-types";
import {
  FINAL_STRETCH_MONTHS,
  isFinalStretchGrade,
} from "./final-stretch-types";
import { buildMonthSlots } from "./months";
import { getProgramSheet } from "./programs";
import { supportsAssignedCampus } from "./member-constants";

export type TeacherOverviewSheetKind =
  | "program"
  | "final-stretch"
  | "course-proposal";

export type TeacherOverviewMonthCell = {
  yearMonth: string;
  monthLabel: string;
  filled: boolean;
  /** 講習提案書の提案内容 */
  advice?: string;
  /** 講習提案書の提案コマ数 */
  sessionCount?: string;
  /** 当該科目に担当講師がいるか（講習提案書） */
  hasAssignee?: boolean;
  /** 当該科目の担当講師名（講習提案書） */
  assigneeName?: string;
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

function resolveOverviewSheetCampus(
  sheetCampus: string | null | undefined,
  teacherDefaultCampus: string | null | undefined,
  studentCampus: string | null | undefined,
  knownCampus?: string,
): string {
  const fromSheet = resolveDisplayCampus(
    sheetCampus,
    teacherDefaultCampus,
    studentCampus,
  );
  if (fromSheet) return fromSheet;
  if (knownCampus) return knownCampus;
  return "";
}

function buildStudentTeacherCampusCache(
  rows: AssignmentOverviewRow[],
): Map<string, string> {
  const db = getDb();
  const cache = new Map<string, string>();
  const seen = new Set<string>();

  for (const row of rows) {
    const key = `${row.studentId}:${row.teacherId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const sheets = db
      .select({ campus: schema.programSheets.campus })
      .from(schema.programSheets)
      .where(
        and(
          eq(schema.programSheets.studentId, row.studentId),
          eq(schema.programSheets.teacherId, row.teacherId),
        ),
      )
      .orderBy(desc(schema.programSheets.updatedAt))
      .all();

    for (const sheet of sheets) {
      const campus = resolveDisplayCampus(
        sheet.campus,
        row.teacherDefaultCampus,
        row.studentCampus,
      );
      if (campus) {
        cache.set(key, campus);
        break;
      }
    }
  }

  return cache;
}

/** 校舎未設定の担当は一覧に含める（プログラムシート未作成など） */
function matchesTeacherOverviewCampusFilter(
  campusFilter: string | null,
  sheetCampus: string,
): boolean {
  if (!campusFilter) return true;
  if (!sheetCampus) return true;
  return sheetCampus === campusFilter;
}

function monthHasContent(content: string | null | undefined): boolean {
  return Boolean(content?.trim());
}

type AssignmentOverviewRow = {
  teacherId: string;
  teacherName: string;
  teacherDefaultCampus: string | null;
  studentId: string;
  studentName: string;
  grade: string;
  studentCampus: string | null;
  subject: string;
};

function listActiveAssignmentRows(): AssignmentOverviewRow[] {
  const db = getDb();
  return db
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
}

function parseCourseProposalSubjectsJson(
  raw: string | null | undefined,
): {
  slots: CourseProposalSubject[];
  subjects: Partial<Record<string, Partial<CourseProposalSubjectData>>>;
} {
  const fallback = {
    slots: [...COURSE_PROPOSAL_SUBJECTS] as CourseProposalSubject[],
    subjects: {},
  };
  if (!raw?.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fallback;
    }
    const record = parsed as Record<string, unknown>;
    const subjects =
      record.subjects &&
      typeof record.subjects === "object" &&
      !Array.isArray(record.subjects)
        ? (record.subjects as Partial<
            Record<string, Partial<CourseProposalSubjectData>>
          >)
        : (record as Partial<
            Record<string, Partial<CourseProposalSubjectData>>
          >);
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

function courseProposalSubjectHasContent(
  data: Partial<CourseProposalSubjectData> | undefined,
): boolean {
  return Boolean(data?.advice?.trim() || data?.sessionCount?.trim());
}

function finalStretchMonthHasContent(
  rows: {
    monthKey: string;
    measure: string | null;
    unitTheme: string | null;
    detail: string | null;
  }[],
  monthKey: string,
): boolean {
  return rows.some(
    (row) =>
      row.monthKey === monthKey &&
      Boolean(row.measure?.trim() || row.unitTheme?.trim() || row.detail?.trim()),
  );
}

function sortTeacherGroups(
  groups: TeacherOverviewTeacherGroup[],
): TeacherOverviewTeacherGroup[] {
  return groups
    .map((group) => ({
      ...group,
      students: group.students.sort((a, b) =>
        a.studentName.localeCompare(b.studentName, "ja"),
      ),
    }))
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName, "ja"));
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

/** 校長の校舎スコープ。担当校舎が無ければ基本校舎にフォールバック */
function getPrincipalCampusScope(userId: string): string | null {
  const db = getDb();
  const viewer = db
    .select({
      assignedCampus: schema.users.assignedCampus,
      defaultCampus: schema.users.defaultCampus,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  return (
    viewer?.assignedCampus?.trim() ||
    viewer?.defaultCampus?.trim() ||
    null
  );
}

/** 講師別・シート閲覧の校舎絞り込み。null＝全校舎、undefined＝表示不可 */
function resolveCampusScope(
  userId: string,
  memberRole: string | undefined,
): string | null | undefined {
  if (!supportsAssignedCampus(memberRole ?? "")) return null;

  if (memberRole === "管理者") {
    return getViewerAssignedCampus(userId);
  }
  if (memberRole === "校長") {
    return getPrincipalCampusScope(userId) ?? undefined;
  }
  return null;
}

/** 講師別一覧用。管理者は全校舎（画面の校舎検索のみ）、校長は担当校舎 */
function resolveTeacherOverviewCampusScope(
  userId: string,
  memberRole: string | undefined,
): string | null | undefined {
  if (memberRole === "校長") {
    return getPrincipalCampusScope(userId) ?? undefined;
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

export function userCanViewProgramSheet(
  sheetId: string,
  userId: string,
  memberRole: string | undefined,
  accessRole: "admin" | "teacher",
): boolean {
  const sheet = getProgramSheet(sheetId);
  if (!sheet) return false;

  // 管理者は講師別一覧と同様に全校舎・担当外を閲覧可（assignedCampus で弾かない）
  if (memberRole === "管理者" || accessRole === "admin") return true;

  // 担当シートは校舎スコープより先に許可（校長の担当校舎未設定でも作成・編集可）
  if (sheet.teacherId === userId) return true;
  if (userIsAssignedToSheet(userId, sheet.studentId, sheet.subject)) {
    return true;
  }

  if (memberRole === "校長") {
    const campusScope = resolveCampusScope(userId, memberRole);
    if (!campusScope) return false;
    // 講師別一覧と同様: 校舎未設定シートは担当校舎スコープ内として閲覧可
    if (!sheet.campus.trim()) return true;
    return sheet.campus === campusScope;
  }

  return false;
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

  const campusScope = resolveTeacherOverviewCampusScope(viewerId, memberRole);
  if (campusScope === undefined) return [];

  const campusFilter = campusScope;

  const assignmentRows = listActiveAssignmentRows();
  const campusCache = buildStudentTeacherCampusCache(assignmentRows);

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

    const campusKey = `${row.studentId}:${row.teacherId}`;
    const sheetCampus = resolveOverviewSheetCampus(
      sheet?.campus,
      row.teacherDefaultCampus,
      row.studentCampus,
      campusCache.get(campusKey),
    );

    if (!matchesTeacherOverviewCampusFilter(campusFilter, sheetCampus)) continue;

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

  return sortTeacherGroups([...byTeacher.values()]);
}

export function getFinalStretchTeacherOverview(
  viewerId: string,
  memberRole: string | undefined,
): TeacherOverviewTeacherGroup[] {
  if (!canViewTeacherOverview(memberRole)) return [];

  const db = getDb();
  const campusScope = resolveTeacherOverviewCampusScope(viewerId, memberRole);
  if (campusScope === undefined) return [];

  const campusFilter = campusScope;
  const assignmentRows = listActiveAssignmentRows().filter((row) =>
    isFinalStretchGrade(row.grade),
  );
  const campusCache = buildStudentTeacherCampusCache(assignmentRows);

  const byTeacher = new Map<string, TeacherOverviewTeacherGroup>();

  for (const row of assignmentRows) {
    const sheet = db
      .select()
      .from(schema.finalStretchSheets)
      .where(
        and(
          eq(schema.finalStretchSheets.studentId, row.studentId),
          eq(schema.finalStretchSheets.subject, row.subject),
          eq(schema.finalStretchSheets.teacherId, row.teacherId),
        ),
      )
      .orderBy(desc(schema.finalStretchSheets.updatedAt))
      .all()[0];

    const campusKey = `${row.studentId}:${row.teacherId}`;
    const sheetCampus = resolveOverviewSheetCampus(
      sheet?.campus,
      row.teacherDefaultCampus,
      row.studentCampus,
      campusCache.get(campusKey),
    );

    if (!matchesTeacherOverviewCampusFilter(campusFilter, sheetCampus)) continue;

    const rows =
      sheet
        ? db
            .select()
            .from(schema.finalStretchRows)
            .where(eq(schema.finalStretchRows.sheetId, sheet.id))
            .orderBy(
              asc(schema.finalStretchRows.monthKey),
              asc(schema.finalStretchRows.rowIndex),
            )
            .all()
        : [];

    const months = FINAL_STRETCH_MONTHS.map((month) => ({
      yearMonth: month.key,
      monthLabel: month.label,
      filled: finalStretchMonthHasContent(rows, month.key),
    }));

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

  return sortTeacherGroups([...byTeacher.values()]);
}

export function getCourseProposalTeacherOverview(
  viewerId: string,
  memberRole: string | undefined,
  year: number,
  season: CourseProposalSeason,
): TeacherOverviewTeacherGroup[] {
  if (!canViewTeacherOverview(memberRole)) return [];

  const db = getDb();
  const campusScope = resolveTeacherOverviewCampusScope(viewerId, memberRole);
  if (campusScope === undefined) return [];

  const campusFilter = campusScope;
  const assignmentRows = listActiveAssignmentRows();
  const campusCache = buildStudentTeacherCampusCache(assignmentRows);

  type SubjectAssignee = { teacherId: string; teacherName: string };
  const assigneesByStudent = new Map<
    string,
    Map<string, SubjectAssignee>
  >();
  const studentMeta = new Map<
    string,
    {
      studentName: string;
      grade: string;
      teacherDefaultCampus: string | null;
      studentCampus: string | null;
    }
  >();

  for (const row of assignmentRows) {
    studentMeta.set(row.studentId, {
      studentName: row.studentName,
      grade: row.grade,
      teacherDefaultCampus: row.teacherDefaultCampus,
      studentCampus: row.studentCampus,
    });
    const bySubject =
      assigneesByStudent.get(row.studentId) ??
      (() => {
        const created = new Map<string, SubjectAssignee>();
        assigneesByStudent.set(row.studentId, created);
        return created;
      })();
    bySubject.set(row.subject, {
      teacherId: row.teacherId,
      teacherName: row.teacherName,
    });
  }

  const students: TeacherOverviewStudentRow[] = [];

  for (const [studentId, meta] of studentMeta) {
    const assignees = assigneesByStudent.get(studentId) ?? new Map();
    const firstAssignee = [...assignees.values()][0];
    const campusKey = firstAssignee
      ? `${studentId}:${firstAssignee.teacherId}`
      : "";

    let sheetCampus = campusCache.get(campusKey) ?? "";
    if (!sheetCampus && firstAssignee) {
      const programSheet = db
        .select({ campus: schema.programSheets.campus })
        .from(schema.programSheets)
        .where(
          and(
            eq(schema.programSheets.studentId, studentId),
            eq(schema.programSheets.teacherId, firstAssignee.teacherId),
          ),
        )
        .orderBy(desc(schema.programSheets.updatedAt))
        .all()[0];
      sheetCampus = resolveOverviewSheetCampus(
        programSheet?.campus,
        meta.teacherDefaultCampus,
        meta.studentCampus,
      );
    }

    if (!matchesTeacherOverviewCampusFilter(campusFilter, sheetCampus)) continue;

    const proposalSheet = db
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

    const proposalData = parseCourseProposalSubjectsJson(
      proposalSheet?.subjectsJson,
    );
    const availableSubjects = new Set<string>([
      ...COURSE_PROPOSAL_SUBJECTS,
      ...assignees.keys(),
    ]);
    const subjectSlots = proposalData.slots
      .filter(
        (subject, index, slots) =>
          availableSubjects.has(subject) && slots.indexOf(subject) === index,
      )
      .slice(0, COURSE_PROPOSAL_SUBJECTS.length);
    for (const subject of COURSE_PROPOSAL_SUBJECTS) {
      if (subjectSlots.length >= COURSE_PROPOSAL_SUBJECTS.length) break;
      if (!subjectSlots.includes(subject)) subjectSlots.push(subject);
    }

    students.push({
      studentId,
      studentName: meta.studentName,
      grade: meta.grade,
      subject: "",
      teacherId: firstAssignee?.teacherId ?? "",
      sheetId: proposalSheet?.id ?? null,
      sheetCampus,
      months: subjectSlots.map((subject) => {
        const assignee = assignees.get(subject);
        return {
          yearMonth: subject,
          monthLabel: subject,
          filled: courseProposalSubjectHasContent(
            proposalData.subjects[subject],
          ),
          advice: trimOrEmpty(proposalData.subjects[subject]?.advice),
          sessionCount: trimOrEmpty(
            proposalData.subjects[subject]?.sessionCount,
          ),
          hasAssignee: Boolean(assignee),
          assigneeName: assignee?.teacherName ?? "",
        };
      }),
    });
  }

  return [
    {
      teacherId: "course-proposal-students",
      teacherName: "",
      students: students.sort((a, b) =>
        a.studentName.localeCompare(b.studentName, "ja"),
      ),
    },
  ];
}
