import { NEW_STUDENT_ID } from "@/lib/student-constants";
import {
  defaultCourseProposalSeason,
  defaultCourseProposalYear,
  isCourseProposalSeason,
  type CourseProposalSeason,
} from "@/lib/course-proposal-types";

export type MakerTab =
  | "program"
  | "final-stretch"
  | "basic"
  | "score-history"
  | "course-proposal"
  | "list"
  | "bulk-pdf"
  | "bulk-final-stretch-pdf"
  | "bulk-course-proposal-pdf"
  | "by-teacher";

const VALID_TABS = new Set<MakerTab>([
  "program",
  "final-stretch",
  "basic",
  "score-history",
  "course-proposal",
  "list",
  "bulk-pdf",
  "bulk-final-stretch-pdf",
  "bulk-course-proposal-pdf",
  "by-teacher",
]);

type AssignmentRef = {
  studentId: string;
  subject: string;
};

export function resolveMakerStateFromSearchParams(
  assignments: AssignmentRef[],
  canViewTeacherOverview: boolean,
  searchParams: Pick<URLSearchParams, "get">,
): {
  studentId: string;
  subject: string;
  activeTab: MakerTab;
  startYearMonth: string;
  courseProposalYear: number;
  courseProposalSeason: CourseProposalSeason;
} {
  const defaultStudentId = assignments[0]?.studentId ?? "";
  const defaultSubject = assignments[0]?.subject ?? "";
  const defaultTab: MakerTab = assignments[0]
    ? "program"
    : canViewTeacherOverview
      ? "by-teacher"
      : "list";

  const studentParam = searchParams.get("student")?.trim() ?? "";
  const subjectParam = searchParams.get("subject")?.trim() ?? "";
  const tabParam = searchParams.get("tab")?.trim() ?? "";
  const monthParam = searchParams.get("month")?.trim() ?? "";

  let studentId = defaultStudentId;
  let subject = defaultSubject;

  if (studentParam === NEW_STUDENT_ID) {
    studentId = NEW_STUDENT_ID;
    if (subjectParam) subject = subjectParam;
  } else if (studentParam && canViewTeacherOverview) {
    studentId = studentParam;
    if (subjectParam) {
      subject = subjectParam;
    } else {
      const anyForStudent = assignments.find(
        (a) => a.studentId === studentParam,
      );
      if (anyForStudent) subject = anyForStudent.subject;
    }
  } else if (studentParam) {
    const withSubject = assignments.find(
      (a) => a.studentId === studentParam && a.subject === subjectParam,
    );
    const anyForStudent = assignments.find((a) => a.studentId === studentParam);
    if (withSubject) {
      studentId = studentParam;
      subject = withSubject.subject;
    } else if (anyForStudent) {
      studentId = studentParam;
      subject = anyForStudent.subject;
    }
  }

  let activeTab: MakerTab = defaultTab;
  if (VALID_TABS.has(tabParam as MakerTab)) {
    const tab = tabParam as MakerTab;
    if (tab !== "by-teacher" || canViewTeacherOverview) {
      activeTab = tab;
    }
  } else if (
    studentParam &&
    studentParam !== NEW_STUDENT_ID &&
    subjectParam &&
    canViewTeacherOverview &&
    defaultTab === "by-teacher"
  ) {
    activeTab = "program";
  }

  const startYearMonth = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : "2026-06";

  const proposalYearRaw = searchParams.get("proposalYear")?.trim() ?? "";
  const proposalYearParam = Number(proposalYearRaw);
  const courseProposalYear =
    proposalYearRaw &&
    Number.isFinite(proposalYearParam) &&
    proposalYearParam >= 2000 &&
    proposalYearParam <= 2100
      ? proposalYearParam
      : defaultCourseProposalYear();
  const proposalSeasonParam = searchParams.get("proposalSeason")?.trim() ?? "";
  const courseProposalSeason = isCourseProposalSeason(proposalSeasonParam)
    ? proposalSeasonParam
    : defaultCourseProposalSeason();

  return {
    studentId,
    subject,
    activeTab,
    startYearMonth,
    courseProposalYear,
    courseProposalSeason,
  };
}

export function buildMakerSearchParams(state: {
  studentId: string;
  subject: string;
  activeTab: MakerTab;
  startYearMonth: string;
  courseProposalYear: number;
  courseProposalSeason: CourseProposalSeason;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (state.studentId) params.set("student", state.studentId);
  if (state.subject) params.set("subject", state.subject);
  if (state.activeTab !== "program") params.set("tab", state.activeTab);
  if (state.startYearMonth) params.set("month", state.startYearMonth);
  if (state.activeTab === "course-proposal") {
    params.set("proposalYear", String(state.courseProposalYear));
    params.set("proposalSeason", state.courseProposalSeason);
  }
  return params;
}

export function makerStateFromSearchParams(
  assignments: AssignmentRef[],
  canViewTeacherOverview: boolean,
  searchParams: Pick<URLSearchParams, "get">,
) {
  return resolveMakerStateFromSearchParams(
    assignments,
    canViewTeacherOverview,
    searchParams,
  );
}
