export type StudentSubjectAssignment = {
  subject: string;
  /** 1=主担当（算数）、2=第2担当（算数2）。同一科目シートを共有 */
  slot: 1 | 2;
  teacherId: string;
  teacherName: string;
};

export type TeacherOption = {
  id: string;
  name: string;
};

export type StudentBasicInfo = {
  id: string;
  name: string;
  gender: string | null;
  grade: string;
  cramSchool: string;
  campus: string;
  className: string;
  classNameLocked: boolean;
  mockExamPattern: string;
  targetSchool: string;
  graduatedAt: string | null;
  assignments: StudentSubjectAssignment[];
  teacherOptions: TeacherOption[];
};

export type StudentBasicInfoInput = {
  name?: string;
  gender?: string | null;
  grade?: string;
  cramSchool?: string;
  campus?: string;
  className?: string;
  classNameLocked?: boolean;
  mockExamPattern?: string;
  targetSchool?: string;
  assignments?: { subject: string; teacherId: string; slot?: 1 | 2 }[];
};

/** UI表示用。slot2 は「算数2」のように末尾に2を付ける */
export function assignmentSlotLabel(subject: string, slot: 1 | 2): string {
  const trimmed = subject.trim();
  if (!trimmed) return "";
  return slot === 2 ? `${trimmed}2` : trimmed;
}

export const SUBJECT_TEACHER_SLOTS = [1, 2] as const;

