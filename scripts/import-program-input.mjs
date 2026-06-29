import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { v4 as uuid } from "uuid";

const CSV_PATH =
  process.argv[2] ??
  path.join(process.env.TEMP ?? "/tmp", "program_input.csv");
const START_ROW = Number(process.argv[3] ?? "539");
const SUBJECT = process.argv[4] ?? "算数";
const DRY_RUN = process.argv.includes("--dry-run");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((c) => c.trim())) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") pushField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && next === "\n") i++;
      pushRow();
    } else field += c;
  }
  if (field || row.length) pushRow();
  return rows;
}

function normalizeName(name) {
  return name.replace(/\s+/g, "　").trim();
}

function toYearMonth(value) {
  const match = (value ?? "").trim().match(/(\d{4})[/-](\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
}

let text = fs.readFileSync(CSV_PATH);
if (text[0] === 0xef && text[1] === 0xbb && text[2] === 0xbf) {
  text = text.slice(3);
}
const records = parseCsv(text.toString("utf8"));
const startIndex = START_ROW - 1;

const entries = records
  .slice(startIndex)
  .filter((cells) => normalizeName(cells[0] ?? ""))
  .map((cells) => ({
    name: normalizeName(cells[0]),
    yearMonth: toYearMonth(cells[1]),
    monthTitle: (cells[2] ?? "").trim(),
    content: (cells[3] ?? "").trim(),
  }))
  .filter((e) => e.yearMonth && (e.monthTitle || e.content));

console.log(`CSV rows from ${START_ROW}: ${entries.length} entries`);

const db = new Database(path.join(process.cwd(), "data", "goukaku.db"));
const students = db.prepare("SELECT id, name FROM students").all();
const studentByName = new Map(
  students.map((s) => [normalizeName(s.name), s.id]),
);

const entriesByStudent = new Map();
for (const entry of entries) {
  const studentId = studentByName.get(entry.name);
  if (!studentId) continue;
  if (!entriesByStudent.has(studentId)) {
    entriesByStudent.set(studentId, []);
  }
  entriesByStudent.get(studentId).push(entry);
}

const now = new Date().toISOString();

function monthLabelFor(yearMonth) {
  const monthNum = Number(yearMonth.split("-")[1]);
  return monthNum === 8 ? "夏期講習" : `${monthNum}月`;
}

function monthIndexFor(startYearMonth, yearMonth) {
  const [sy, sm] = startYearMonth.split("-").map(Number);
  const [y, m] = yearMonth.split("-").map(Number);
  return (y - sy) * 12 + (m - sm);
}

function findOrCreateSheet(studentId, teacherId, startYearMonth) {
  let sheet = db
    .prepare(
      `SELECT id, start_year_month AS startYearMonth FROM program_sheets
       WHERE student_id = ? AND subject = ? AND teacher_id = ?
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(studentId, SUBJECT, teacherId);

  if (sheet) return sheet;

  if (DRY_RUN) return { id: "(new)", startYearMonth };

  const sheetId = uuid();
  db.prepare(
    `INSERT INTO program_sheets
     (id, student_id, subject, teacher_id, start_year_month, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(sheetId, studentId, SUBJECT, teacherId, startYearMonth, now, now);
  return { id: sheetId, startYearMonth };
}

let updated = 0;
const skippedNoStudent = entries.filter((e) => !studentByName.has(e.name)).length;
let skippedNoAssignment = 0;
let createdSheets = 0;
let createdMonths = 0;

for (const [studentId, studentEntries] of entriesByStudent) {
  const assignment = db
    .prepare(
      `SELECT teacher_id AS teacherId FROM student_assignments
       WHERE student_id = ? AND subject = ? LIMIT 1`,
    )
    .get(studentId, SUBJECT);

  if (!assignment) {
    skippedNoAssignment += studentEntries.length;
    continue;
  }

  const earliestMonth = studentEntries
    .map((e) => e.yearMonth)
    .sort()[0];

  let sheet = findOrCreateSheet(
    studentId,
    assignment.teacherId,
    earliestMonth,
  );
  if (sheet.id === "(new)") createdSheets++;

  for (const entry of studentEntries) {
    let month = db
      .prepare(
        `SELECT id FROM program_months
         WHERE sheet_id = ? AND year_month = ?`,
      )
      .get(sheet.id, entry.yearMonth);

    if (!month) {
      if (DRY_RUN) {
        createdMonths++;
        updated++;
        continue;
      }
      const monthId = uuid();
      db.prepare(
        `INSERT INTO program_months
         (id, sheet_id, month_index, year_month, month_label, month_title, content)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        monthId,
        sheet.id,
        monthIndexFor(sheet.startYearMonth, entry.yearMonth),
        entry.yearMonth,
        monthLabelFor(entry.yearMonth),
        entry.monthTitle,
        entry.content,
      );
      createdMonths++;
      updated++;
      continue;
    }

    if (!DRY_RUN) {
      db.prepare(
        `UPDATE program_months
         SET month_title = ?, content = ?
         WHERE id = ?`,
      ).run(entry.monthTitle, entry.content, month.id);
      db.prepare(`UPDATE program_sheets SET updated_at = ? WHERE id = ?`).run(
        now,
        sheet.id,
      );
    }
    updated++;
  }
}

console.log({
  updated,
  createdSheets,
  createdMonths,
  skippedNoStudent,
  skippedNoAssignment,
  dryRun: DRY_RUN,
});

const matchedNames = [
  ...new Set(
    entries
      .map((e) => e.name)
      .filter((name) => studentByName.has(name)),
  ),
];
console.log("matched students:", matchedNames);

db.close();
