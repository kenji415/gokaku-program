import { NEW_STUDENT_ID } from "@/lib/student-constants";

export type MakerTab =
  | "program"
  | "final-stretch"
  | "basic"
  | "score-history"
  | "list"
  | "bulk-pdf"
  | "bulk-final-stretch-pdf"
  | "by-teacher";

const VALID_TABS = new Set<MakerTab>([
  "program",
  "final-stretch",
  "basic",
  "score-history",
  "list",
  "bulk-pdf",
  "bulk-final-stretch-pdf",
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
  } else if (
    studentParam &&
    subjectParam &&
    canViewTeacherOverview
  ) {
    studentId = studentParam;
    subject = subjectParam;
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
  }

  const startYearMonth = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : "2026-06";

  return { studentId, subject, activeTab, startYearMonth };
}

export function buildMakerSearchParams(state: {
  studentId: string;
  subject: string;
  activeTab: MakerTab;
  startYearMonth: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (state.studentId) params.set("student", state.studentId);
  if (state.subject) params.set("subject", state.subject);
  if (state.activeTab !== "program") params.set("tab", state.activeTab);
  if (state.startYearMonth) params.set("month", state.startYearMonth);
  return params;
}
