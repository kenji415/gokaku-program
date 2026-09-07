export type GuidancePolicyMemo = {
  id: string;
  memoDate: string;
  body: string;
  createdAt: string;
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
