export type GuidancePolicyMemo = {
  id: string;
  memoDate: string;
  body: string;
  createdAt: string;
  /** 記入した講師の名字 */
  authorSurname: string;
};

export type GuidancePolicySheetData = {
  id: string;
  studentId: string;
  subject: string;
  teacherId: string;
  policyText: string;
  memos: GuidancePolicyMemo[];
  student: {
    name: string;
    grade: string;
  };
};
