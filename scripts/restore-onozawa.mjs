import Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import { loadEnvFiles, resolveDatabasePath } from "./data-path.mjs";

loadEnvFiles();
const dbPath = resolveDatabasePath();
const db = new Database(dbPath);

const YOSHIOKA_ID = "64220ff5-8b1d-44d9-bf0e-d798c2e10521";

const existing = db
  .prepare(`SELECT id FROM students WHERE name = ?`)
  .get("小野澤　陸");

if (existing) {
  console.log("already exists:", existing);
  process.exit(0);
}

const studentId = uuid();
const now = new Date().toISOString();

db.prepare(
  `INSERT INTO students (
    id, name, gender, grade, cram_school, campus, class_name,
    mock_exam_pattern, initial_challenges, goal, start_date, graduated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
).run(
  studentId,
  "小野澤　陸",
  "男",
  "6年",
  "SAPIX",
  "白金高輪",
  "H",
  "SAPIX",
  "12月マンスリ― 4科56.4 算59.2 国51.3 理54.5 社55.3\n平面図形・立体図形",
  "志望校合格に向けて",
  null,
  null,
);

db.prepare(
  `INSERT INTO student_assignments (id, student_id, teacher_id, subject)
   VALUES (?, ?, ?, ?)`,
).run(uuid(), studentId, YOSHIOKA_ID, "算数");

console.log("restored student:", studentId);
db.close();
