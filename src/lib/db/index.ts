import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { seedDatabase } from "./seed";
import {
  resolveDatabasePath,
  useNetworkDatabaseSettings,
} from "../data-path";
import { normalizeStudentName } from "../student-name";
import { seedMembersIfNeeded } from "../members";
import { runTestScheduleRepair } from "../test-schedule-repair";
import { invalidateTestScheduleCache } from "../test-schedule-cache";

type AppDb = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as {
  db?: { drizzle: AppDb; sqlite: Database.Database };
};

function ensureSchema(sqlite: Database.Database) {
  const userColumns = sqlite
    .prepare("PRAGMA table_info(users)")
    .all() as { name: string }[];
  if (!userColumns.some((c) => c.name === "password")) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN password TEXT NOT NULL DEFAULT ''`);
  }
  if (!userColumns.some((c) => c.name === "default_campus")) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN default_campus TEXT`);
  }
  if (!userColumns.some((c) => c.name === "member_role")) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN member_role TEXT`);
  }
  if (!userColumns.some((c) => c.name === "assigned_campus")) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN assigned_campus TEXT`);
  }

  const studentColumns = sqlite
    .prepare("PRAGMA table_info(students)")
    .all() as { name: string }[];
  if (!studentColumns.some((c) => c.name === "target_school")) {
    sqlite.exec(`ALTER TABLE students ADD COLUMN target_school TEXT`);
  }
  if (!studentColumns.some((c) => c.name === "initial_mock_exams")) {
    sqlite.exec(`ALTER TABLE students ADD COLUMN initial_mock_exams TEXT`);
  }
  if (!studentColumns.some((c) => c.name === "graduated_at")) {
    sqlite.exec(`ALTER TABLE students ADD COLUMN graduated_at TEXT`);
  }
  if (!studentColumns.some((c) => c.name === "graduated_by_teacher_id")) {
    sqlite.exec(`ALTER TABLE students ADD COLUMN graduated_by_teacher_id TEXT REFERENCES users(id)`);
  }

  const resultColumns = sqlite
    .prepare("PRAGMA table_info(student_test_results)")
    .all() as { name: string }[];
  if (!resultColumns.some((c) => c.name === "extra_scores")) {
    sqlite.exec(`ALTER TABLE student_test_results ADD COLUMN extra_scores TEXT`);
  }

  const sheetColumns = sqlite
    .prepare("PRAGMA table_info(program_sheets)")
    .all() as { name: string }[];
  if (!sheetColumns.some((c) => c.name === "campus")) {
    sqlite.exec(`ALTER TABLE program_sheets ADD COLUMN campus TEXT`);
  }
  if (!sheetColumns.some((c) => c.name === "goal")) {
    sqlite.exec(`ALTER TABLE program_sheets ADD COLUMN goal TEXT`);
  }
  if (!sheetColumns.some((c) => c.name === "initial_challenges")) {
    sqlite.exec(`ALTER TABLE program_sheets ADD COLUMN initial_challenges TEXT`);
    sqlite.exec(`
      UPDATE program_sheets
      SET initial_challenges = (
        SELECT initial_challenges FROM students
        WHERE students.id = program_sheets.student_id
      )
      WHERE subject = '算数'
        AND (
          initial_challenges IS NULL
          OR TRIM(initial_challenges) = ''
        )
        AND EXISTS (
          SELECT 1 FROM students
          WHERE students.id = program_sheets.student_id
            AND students.initial_challenges IS NOT NULL
            AND TRIM(students.initial_challenges) != ''
        )
    `);
  }

  const sheetColumnsAfter = sqlite
    .prepare("PRAGMA table_info(program_sheets)")
    .all() as { name: string }[];
  if (!sheetColumnsAfter.some((c) => c.name === "pdf_exported_at")) {
    sqlite.exec(`ALTER TABLE program_sheets ADD COLUMN pdf_exported_at TEXT`);
  }

  const sheetColumnsWithPdf = sqlite
    .prepare("PRAGMA table_info(program_sheets)")
    .all() as { name: string }[];
  if (!sheetColumnsWithPdf.some((c) => c.name === "cram_school")) {
    sqlite.exec(`ALTER TABLE program_sheets ADD COLUMN cram_school TEXT`);
    sqlite.exec(`ALTER TABLE program_sheets ADD COLUMN attendance_campus TEXT`);
    sqlite.exec(`ALTER TABLE program_sheets ADD COLUMN class_name TEXT`);
    sqlite.exec(`ALTER TABLE program_sheets ADD COLUMN target_school TEXT`);
    sqlite.exec(`ALTER TABLE program_sheets ADD COLUMN initial_mock_exams TEXT`);
    sqlite.exec(`
      UPDATE program_sheets
      SET
        cram_school = (SELECT cram_school FROM students WHERE students.id = program_sheets.student_id),
        attendance_campus = (SELECT campus FROM students WHERE students.id = program_sheets.student_id),
        class_name = (SELECT class_name FROM students WHERE students.id = program_sheets.student_id),
        target_school = (SELECT target_school FROM students WHERE students.id = program_sheets.student_id),
        initial_mock_exams = (SELECT initial_mock_exams FROM students WHERE students.id = program_sheets.student_id),
        goal = COALESCE(NULLIF(TRIM(goal), ''), (SELECT goal FROM students WHERE students.id = program_sheets.student_id))
      WHERE EXISTS (SELECT 1 FROM students WHERE students.id = program_sheets.student_id)
    `);
  }

  const testScheduleColumns = sqlite
    .prepare("PRAGMA table_info(test_schedules)")
    .all() as { name: string }[];
  if (!testScheduleColumns.some((c) => c.name === "in_test_course")) {
    sqlite.exec(
      `ALTER TABLE test_schedules ADD COLUMN in_test_course INTEGER NOT NULL DEFAULT 0`,
    );
    sqlite.exec(`
      UPDATE test_schedules
      SET in_test_course = 1
      WHERE cram_school IS NOT NULL AND TRIM(cram_school) != ''
    `);
  }

  sqlite.exec(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)`);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS final_stretch_sheets (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id),
      subject TEXT NOT NULL,
      teacher_id TEXT NOT NULL REFERENCES users(id),
      campus TEXT,
      policy TEXT,
      exam_day_simulation TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(student_id, subject)
    );
    CREATE TABLE IF NOT EXISTS final_stretch_rows (
      id TEXT PRIMARY KEY,
      sheet_id TEXT NOT NULL REFERENCES final_stretch_sheets(id),
      month_key TEXT NOT NULL,
      row_index INTEGER NOT NULL,
      measure TEXT,
      unit_theme TEXT,
      detail TEXT
    );
  `);

  const finalStretchSheetColumns = sqlite
    .prepare("PRAGMA table_info(final_stretch_sheets)")
    .all() as { name: string }[];
  if (!finalStretchSheetColumns.some((c) => c.name === "column_widths")) {
    sqlite.exec(`ALTER TABLE final_stretch_sheets ADD COLUMN column_widths TEXT`);
  }
  if (!finalStretchSheetColumns.some((c) => c.name === "pdf_exported_at")) {
    sqlite.exec(
      `ALTER TABLE final_stretch_sheets ADD COLUMN pdf_exported_at TEXT`,
    );
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS course_proposal_sheets (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id),
      teacher_id TEXT NOT NULL REFERENCES users(id),
      year INTEGER NOT NULL,
      season TEXT NOT NULL,
      subjects_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(student_id, year, season)
    );
  `);

  const courseProposalSheetColumns = sqlite
    .prepare("PRAGMA table_info(course_proposal_sheets)")
    .all() as { name: string }[];
  if (!courseProposalSheetColumns.some((c) => c.name === "pdf_exported_at")) {
    sqlite.exec(
      `ALTER TABLE course_proposal_sheets ADD COLUMN pdf_exported_at TEXT`,
    );
  }

  const testCourseCleanup = sqlite
    .prepare(`SELECT value FROM app_meta WHERE key = 'test_course_link_cleanup'`)
    .get() as { value: string } | undefined;
  if (!testCourseCleanup) {
    sqlite.exec(`
      DELETE FROM student_month_tests
      WHERE test_schedule_id IN (
        SELECT id FROM test_schedules WHERE in_test_course = 0
      )
      AND test_schedule_id IN (
        SELECT test_schedule_id
        FROM student_month_tests
        GROUP BY test_schedule_id
        HAVING COUNT(DISTINCT student_id) > 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM student_test_results str
        WHERE str.student_id = student_month_tests.student_id
          AND str.test_schedule_id = student_month_tests.test_schedule_id
      )
    `);
    sqlite.exec(`
      INSERT INTO app_meta (key, value) VALUES ('test_course_link_cleanup', '1')
    `);
  }

  const unlinkedSheetCampus = sqlite
    .prepare(`SELECT value FROM app_meta WHERE key = 'unlinked_sheet_student_campus'`)
    .get() as { value: string } | undefined;
  if (!unlinkedSheetCampus) {
    sqlite.exec(`
      UPDATE program_sheets
      SET campus = NULL
      WHERE campus IS NOT NULL
        AND TRIM(campus) != ''
        AND EXISTS (
          SELECT 1 FROM students
          WHERE students.id = program_sheets.student_id
            AND students.campus IS NOT NULL
            AND TRIM(students.campus) = TRIM(program_sheets.campus)
        )
    `);
    sqlite.exec(`
      INSERT INTO app_meta (key, value) VALUES ('unlinked_sheet_student_campus', '1')
    `);
  }

  const normalizedNames = sqlite
    .prepare(`SELECT value FROM app_meta WHERE key = 'normalize_student_names'`)
    .get() as { value: string } | undefined;
  if (!normalizedNames) {
    const rows = sqlite
      .prepare(`SELECT id, name FROM students`)
      .all() as { id: string; name: string }[];
    const update = sqlite.prepare(`UPDATE students SET name = ? WHERE id = ?`);
    for (const row of rows) {
      const normalized = normalizeStudentName(row.name);
      if (normalized !== row.name) {
        update.run(normalized, row.id);
      }
    }
    sqlite.exec(`
      INSERT INTO app_meta (key, value) VALUES ('normalize_student_names', '1')
    `);
  }

  const normalizedNamesFullWidth = sqlite
    .prepare(
      `SELECT value FROM app_meta WHERE key = 'normalize_student_names_fullwidth'`,
    )
    .get() as { value: string } | undefined;
  if (!normalizedNamesFullWidth) {
    const rows = sqlite
      .prepare(`SELECT id, name FROM students`)
      .all() as { id: string; name: string }[];
    const update = sqlite.prepare(`UPDATE students SET name = ? WHERE id = ?`);
    for (const row of rows) {
      const normalized = normalizeStudentName(row.name);
      if (normalized !== row.name) {
        update.run(normalized, row.id);
      }
    }
    sqlite.exec(`
      INSERT INTO app_meta (key, value) VALUES ('normalize_student_names_fullwidth', '1')
    `);
  }

  runTestScheduleRepair(sqlite);
  invalidateTestScheduleCache();
}

function createDb() {
  const dbPath = resolveDatabasePath();
  const sqlite = new Database(dbPath);
  if (useNetworkDatabaseSettings()) {
    sqlite.pragma("journal_mode = DELETE");
    sqlite.pragma("synchronous = FULL");
    sqlite.pragma("busy_timeout = 5000");
  } else {
    sqlite.pragma("journal_mode = WAL");
  }
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      login_id TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gender TEXT,
      grade TEXT NOT NULL,
      cram_school TEXT,
      campus TEXT,
      class_name TEXT,
      mock_exam_pattern TEXT,
      target_school TEXT,
      initial_mock_exams TEXT,
      initial_challenges TEXT,
      goal TEXT,
      start_date TEXT
    );
    CREATE TABLE IF NOT EXISTS student_assignments (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id),
      teacher_id TEXT NOT NULL REFERENCES users(id),
      subject TEXT NOT NULL,
      UNIQUE(student_id, subject)
    );
    CREATE TABLE IF NOT EXISTS test_schedules (
      id TEXT PRIMARY KEY,
      cram_school TEXT,
      grade TEXT NOT NULL,
      test_name TEXT NOT NULL,
      test_date TEXT,
      display_text TEXT NOT NULL,
      year_month TEXT NOT NULL,
      in_test_course INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS program_sheets (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id),
      subject TEXT NOT NULL,
      teacher_id TEXT NOT NULL REFERENCES users(id),
      start_year_month TEXT NOT NULL,
      campus TEXT,
      goal TEXT,
      initial_challenges TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS program_months (
      id TEXT PRIMARY KEY,
      sheet_id TEXT NOT NULL REFERENCES program_sheets(id),
      month_index INTEGER NOT NULL,
      year_month TEXT NOT NULL,
      month_label TEXT NOT NULL,
      month_title TEXT,
      content TEXT
    );
    CREATE TABLE IF NOT EXISTS program_month_tests (
      id TEXT PRIMARY KEY,
      program_month_id TEXT NOT NULL REFERENCES program_months(id),
      test_schedule_id TEXT NOT NULL REFERENCES test_schedules(id)
    );
    CREATE TABLE IF NOT EXISTS student_month_tests (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id),
      year_month TEXT NOT NULL,
      test_schedule_id TEXT NOT NULL REFERENCES test_schedules(id),
      UNIQUE(student_id, year_month, test_schedule_id)
    );
    CREATE TABLE IF NOT EXISTS student_test_results (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id),
      test_schedule_id TEXT NOT NULL REFERENCES test_schedules(id),
      deviation TEXT,
      four_subjects TEXT,
      math TEXT,
      japanese TEXT,
      science TEXT,
      social TEXT,
      notes TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(student_id, test_schedule_id)
    );
  `);

  ensureSchema(sqlite);
  migrateStudentMonthTests(sqlite);
  seedMembersIfNeeded(sqlite, db);

  seedDatabase(db);

  return { drizzle: db, sqlite };
}

function migrateStudentMonthTests(sqlite: Database.Database) {
  const count = sqlite
    .prepare("SELECT COUNT(*) AS c FROM student_month_tests")
    .get() as { c: number };
  if (count.c > 0) return;

  sqlite.exec(`
    INSERT INTO student_month_tests (id, student_id, year_month, test_schedule_id)
    SELECT
      lower(hex(randomblob(16))),
      ps.student_id,
      pm.year_month,
      pmt.test_schedule_id
    FROM program_month_tests pmt
    INNER JOIN program_months pm ON pm.id = pmt.program_month_id
    INNER JOIN program_sheets ps ON ps.id = pm.sheet_id
    GROUP BY ps.student_id, pm.year_month, pmt.test_schedule_id
  `);
}

export function getDb() {
  if (!globalForDb.db) {
    globalForDb.db = createDb();
  }
  return globalForDb.db.drizzle;
}
