import Database from "better-sqlite3";
import path from "path";

const db = new Database(path.join(process.cwd(), "data", "goukaku.db"));
const student = db
  .prepare(`SELECT id, name, grade, campus, class_name FROM students WHERE name LIKE '%小野%'`)
  .get();
console.log("student:", student);
if (student) {
  const teacher = db
    .prepare(
      `SELECT u.name FROM student_assignments sa JOIN users u ON u.id = sa.teacher_id WHERE sa.student_id = ?`,
    )
    .get(student.id);
  const months = db
    .prepare(
      `SELECT pm.year_month, pm.month_title FROM program_months pm
       JOIN program_sheets ps ON ps.id = pm.sheet_id WHERE ps.student_id = ?
       ORDER BY pm.year_month`,
    )
    .all(student.id);
  console.log("teacher:", teacher);
  console.log("months:", months.length);
  console.log(months);
}
db.close();
