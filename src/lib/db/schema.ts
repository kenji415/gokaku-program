import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  loginId: text("login_id").notNull().unique(),
  password: text("password").notNull().default(""),
  role: text("role", { enum: ["admin", "teacher"] }).notNull(),
  memberRole: text("member_role"),
  assignedCampus: text("assigned_campus"),
  defaultCampus: text("default_campus"),
});

export const students = sqliteTable("students", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  gender: text("gender"),
  grade: text("grade").notNull(),
  cramSchool: text("cram_school"),
  campus: text("campus"),
  className: text("class_name"),
  mockExamPattern: text("mock_exam_pattern"),
  targetSchool: text("target_school"),
  initialMockExams: text("initial_mock_exams"),
  initialChallenges: text("initial_challenges"),
  goal: text("goal"),
  startDate: text("start_date"),
  graduatedAt: text("graduated_at"),
  graduatedByTeacherId: text("graduated_by_teacher_id").references(() => users.id),
});

export const studentAssignments = sqliteTable(
  "student_assignments",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => users.id),
    subject: text("subject").notNull(),
  },
  (t) => [unique().on(t.studentId, t.subject)],
);

export const testSchedules = sqliteTable("test_schedules", {
  id: text("id").primaryKey(),
  cramSchool: text("cram_school"),
  grade: text("grade").notNull(),
  testName: text("test_name").notNull(),
  testDate: text("test_date"),
  displayText: text("display_text").notNull(),
  yearMonth: text("year_month").notNull(),
  inTestCourse: integer("in_test_course").notNull().default(0),
});

export const programSheets = sqliteTable("program_sheets", {
  id: text("id").primaryKey(),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id),
  subject: text("subject").notNull(),
  teacherId: text("teacher_id")
    .notNull()
    .references(() => users.id),
  startYearMonth: text("start_year_month").notNull(),
  campus: text("campus"),
  goal: text("goal"),
  cramSchool: text("cram_school"),
  attendanceCampus: text("attendance_campus"),
  className: text("class_name"),
  targetSchool: text("target_school"),
  initialMockExams: text("initial_mock_exams"),
  initialChallenges: text("initial_challenges"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  pdfExportedAt: text("pdf_exported_at"),
});

export const programMonths = sqliteTable("program_months", {
  id: text("id").primaryKey(),
  sheetId: text("sheet_id")
    .notNull()
    .references(() => programSheets.id),
  monthIndex: integer("month_index").notNull(),
  yearMonth: text("year_month").notNull(),
  monthLabel: text("month_label").notNull(),
  monthTitle: text("month_title"),
  content: text("content"),
});

export const studentMonthTests = sqliteTable(
  "student_month_tests",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    yearMonth: text("year_month").notNull(),
    testScheduleId: text("test_schedule_id")
      .notNull()
      .references(() => testSchedules.id),
  },
  (t) => [unique().on(t.studentId, t.yearMonth, t.testScheduleId)],
);

export const studentTestResults = sqliteTable(
  "student_test_results",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    testScheduleId: text("test_schedule_id")
      .notNull()
      .references(() => testSchedules.id),
    deviation: text("deviation"),
    fourSubjects: text("four_subjects"),
    math: text("math"),
    japanese: text("japanese"),
    science: text("science"),
    social: text("social"),
    notes: text("notes"),
    extraScores: text("extra_scores"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [unique().on(t.studentId, t.testScheduleId)],
);

export const programMonthTests = sqliteTable("program_month_tests", {
  id: text("id").primaryKey(),
  programMonthId: text("program_month_id")
    .notNull()
    .references(() => programMonths.id),
  testScheduleId: text("test_schedule_id")
    .notNull()
    .references(() => testSchedules.id),
});

export const finalStretchSheets = sqliteTable(
  "final_stretch_sheets",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    subject: text("subject").notNull(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => users.id),
    campus: text("campus"),
    policy: text("policy"),
    examDaySimulation: text("exam_day_simulation"),
    columnWidths: text("column_widths"),
    pdfExportedAt: text("pdf_exported_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [unique().on(t.studentId, t.subject)],
);

export const finalStretchRows = sqliteTable("final_stretch_rows", {
  id: text("id").primaryKey(),
  sheetId: text("sheet_id")
    .notNull()
    .references(() => finalStretchSheets.id),
  monthKey: text("month_key").notNull(),
  rowIndex: integer("row_index").notNull(),
  measure: text("measure"),
  unitTheme: text("unit_theme"),
  detail: text("detail"),
});

export const courseProposalSheets = sqliteTable(
  "course_proposal_sheets",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => users.id),
    year: integer("year").notNull(),
    season: text("season", {
      enum: ["spring", "summer", "winter"],
    }).notNull(),
    subjectsJson: text("subjects_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    pdfExportedAt: text("pdf_exported_at"),
  },
  (t) => [unique().on(t.studentId, t.year, t.season)],
);
