export type StudentSubjectAssignment = {
  subject: string;
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
  mockExamPattern?: string;
  targetSchool?: string;
  assignments?: { subject: string; teacherId: string }[];
};
