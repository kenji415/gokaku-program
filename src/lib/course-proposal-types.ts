export const COURSE_PROPOSAL_SUBJECTS = [
  "算数",
  "国語",
  "理科",
  "社会",
] as const;

export type CourseProposalSubject = string;

export const COURSE_PROPOSAL_SEASONS = ["spring", "summer", "winter"] as const;

export type CourseProposalSeason = (typeof COURSE_PROPOSAL_SEASONS)[number];

export const COURSE_PROPOSAL_SEASON_LABELS: Record<
  CourseProposalSeason,
  string
> = {
  spring: "春期",
  summer: "夏期",
  winter: "冬期",
};

export type CourseProposalSubjectData = {
  advice: string;
  sessionCount: string;
  teacherName: string;
};

export type CourseProposalSubjects = Record<string, CourseProposalSubjectData>;

export type CourseProposalSheetData = {
  id: string;
  studentId: string;
  teacherId: string;
  year: number;
  season: CourseProposalSeason;
  subjectSlots: CourseProposalSubject[];
  availableSubjects: CourseProposalSubject[];
  subjects: CourseProposalSubjects;
  student: {
    name: string;
    gender: string | null;
    grade: string;
  };
  teacherCampuses: string[];
  editableSubjects: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
};

export function createEmptyCourseProposalSubjects(): CourseProposalSubjects {
  return Object.fromEntries(
    COURSE_PROPOSAL_SUBJECTS.map((subject) => [
      subject,
      { advice: "", sessionCount: "", teacherName: "" },
    ]),
  );
}

export function createEmptySubjectData(): CourseProposalSubjectData {
  return { advice: "", sessionCount: "", teacherName: "" };
}

export function defaultCourseProposalYear(): number {
  return new Date().getFullYear();
}

export function defaultCourseProposalSeason(): CourseProposalSeason {
  const month = new Date().getMonth() + 1;
  if (month <= 2 || month === 12) return "winter";
  if (month <= 5) return "spring";
  return "summer";
}

export function isCourseProposalSeason(value: string): value is CourseProposalSeason {
  return (COURSE_PROPOSAL_SEASONS as readonly string[]).includes(value);
}
