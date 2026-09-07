import { and, asc, desc, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import * as schema from "./db/schema";
import { userCanViewProgramSheet } from "./teacher-overview";
import type {
  GuidancePolicyMemo,
  GuidancePolicySheetData,
} from "./guidance-policy-types";

export type {
  GuidancePolicyMemo,
  GuidancePolicySheetData,
} from "./guidance-policy-types";


function resolveProgramSheetId(
  studentId: string,
  subject: string,
): string | null {
  const db = getDb();
  const row = db
    .select({ id: schema.programSheets.id })
    .from(schema.programSheets)
    .where(
      and(
        eq(schema.programSheets.studentId, studentId),
        eq(schema.programSheets.subject, subject),
      ),
    )
    .orderBy(asc(schema.programSheets.updatedAt))
    .all()
    .at(-1);
  return row?.id ?? null;
}

export function userCanAccessGuidancePolicy(
  studentId: string,
  subject: string,
  teacherId: string,
  userId: string,
  memberRole: string | undefined,
  accessRole: "admin" | "teacher",
): boolean {
  if (memberRole === "管理者" || accessRole === "admin") return true;

  const programSheetId = resolveProgramSheetId(studentId, subject);
  if (programSheetId) {
    return userCanViewProgramSheet(
      programSheetId,
      userId,
      memberRole,
      accessRole,
    );
  }

  if (teacherId === userId) return true;

  const db = getDb();
  const assignment = db
    .select({ id: schema.studentAssignments.id })
    .from(schema.studentAssignments)
    .where(
      and(
        eq(schema.studentAssignments.teacherId, userId),
        eq(schema.studentAssignments.studentId, studentId),
        eq(schema.studentAssignments.subject, subject),
      ),
    )
    .get();
  return Boolean(assignment);
}

function loadMemos(sheetId: string): GuidancePolicyMemo[] {
  const db = getDb();
  return db
    .select()
    .from(schema.guidancePolicyMemos)
    .where(eq(schema.guidancePolicyMemos.sheetId, sheetId))
    .orderBy(desc(schema.guidancePolicyMemos.createdAt))
    .all()
    .map((row) => ({
      id: row.id,
      memoDate: row.memoDate,
      body: row.body,
      createdAt: row.createdAt,
    }));
}

export function getGuidancePolicySheet(
  sheetId: string,
): GuidancePolicySheetData | null {
  const db = getDb();
  const sheet = db
    .select()
    .from(schema.guidancePolicySheets)
    .where(eq(schema.guidancePolicySheets.id, sheetId))
    .get();
  if (!sheet) return null;

  const student = db
    .select({
      name: schema.students.name,
      grade: schema.students.grade,
    })
    .from(schema.students)
    .where(eq(schema.students.id, sheet.studentId))
    .get();
  if (!student) return null;

  return {
    id: sheet.id,
    studentId: sheet.studentId,
    subject: sheet.subject,
    teacherId: sheet.teacherId,
    policyText: sheet.policyText ?? "",
    memos: loadMemos(sheet.id),
    student: {
      name: student.name,
      grade: student.grade,
    },
  };
}

export function findOrCreateGuidancePolicySheet(params: {
  studentId: string;
  subject: string;
  teacherId: string;
}): GuidancePolicySheetData {
  const db = getDb();
  const existing = db
    .select()
    .from(schema.guidancePolicySheets)
    .where(
      and(
        eq(schema.guidancePolicySheets.studentId, params.studentId),
        eq(schema.guidancePolicySheets.subject, params.subject),
      ),
    )
    .get();

  if (existing) {
    const data = getGuidancePolicySheet(existing.id);
    if (data) return data;
  }

  const now = new Date().toISOString();
  const id = uuid();
  db.insert(schema.guidancePolicySheets)
    .values({
      id,
      studentId: params.studentId,
      subject: params.subject,
      teacherId: params.teacherId,
      policyText: "",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const created = getGuidancePolicySheet(id);
  if (!created) {
    throw new Error("Failed to create guidance policy sheet");
  }
  return created;
}

export function updateGuidancePolicyText(
  sheetId: string,
  policyText: string,
): boolean {
  const db = getDb();
  const existing = db
    .select({ id: schema.guidancePolicySheets.id })
    .from(schema.guidancePolicySheets)
    .where(eq(schema.guidancePolicySheets.id, sheetId))
    .get();
  if (!existing) return false;

  db.update(schema.guidancePolicySheets)
    .set({
      policyText,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.guidancePolicySheets.id, sheetId))
    .run();
  return true;
}

export function addGuidancePolicyMemo(params: {
  sheetId: string;
  memoDate: string;
  body: string;
}): GuidancePolicyMemo | null {
  const memoDate = params.memoDate.trim();
  const body = params.body.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(memoDate) || !body) return null;

  const db = getDb();
  const sheet = db
    .select({ id: schema.guidancePolicySheets.id })
    .from(schema.guidancePolicySheets)
    .where(eq(schema.guidancePolicySheets.id, params.sheetId))
    .get();
  if (!sheet) return null;

  const now = new Date().toISOString();
  const id = uuid();
  db.insert(schema.guidancePolicyMemos)
    .values({
      id,
      sheetId: params.sheetId,
      memoDate,
      body,
      createdAt: now,
    })
    .run();
  db.update(schema.guidancePolicySheets)
    .set({ updatedAt: now })
    .where(eq(schema.guidancePolicySheets.id, params.sheetId))
    .run();

  return { id, memoDate, body, createdAt: now };
}

export function updateGuidancePolicyMemo(params: {
  sheetId: string;
  memoId: string;
  memoDate: string;
  body: string;
}): GuidancePolicyMemo | null {
  const memoDate = params.memoDate.trim();
  const body = params.body.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(memoDate) || !body) return null;

  const db = getDb();
  const existing = db
    .select()
    .from(schema.guidancePolicyMemos)
    .where(
      and(
        eq(schema.guidancePolicyMemos.id, params.memoId),
        eq(schema.guidancePolicyMemos.sheetId, params.sheetId),
      ),
    )
    .get();
  if (!existing) return null;

  const now = new Date().toISOString();
  db.update(schema.guidancePolicyMemos)
    .set({ memoDate, body })
    .where(eq(schema.guidancePolicyMemos.id, params.memoId))
    .run();
  db.update(schema.guidancePolicySheets)
    .set({ updatedAt: now })
    .where(eq(schema.guidancePolicySheets.id, params.sheetId))
    .run();

  return {
    id: existing.id,
    memoDate,
    body,
    createdAt: existing.createdAt,
  };
}

export function deleteGuidancePolicyMemo(
  sheetId: string,
  memoId: string,
): boolean {
  const db = getDb();
  const memo = db
    .select({ id: schema.guidancePolicyMemos.id })
    .from(schema.guidancePolicyMemos)
    .where(
      and(
        eq(schema.guidancePolicyMemos.id, memoId),
        eq(schema.guidancePolicyMemos.sheetId, sheetId),
      ),
    )
    .get();
  if (!memo) return false;

  db.delete(schema.guidancePolicyMemos)
    .where(eq(schema.guidancePolicyMemos.id, memoId))
    .run();
  db.update(schema.guidancePolicySheets)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(schema.guidancePolicySheets.id, sheetId))
    .run();
  return true;
}

export function deleteGuidancePolicyForStudent(studentId: string) {
  const db = getDb();
  const sheets = db
    .select({ id: schema.guidancePolicySheets.id })
    .from(schema.guidancePolicySheets)
    .where(eq(schema.guidancePolicySheets.studentId, studentId))
    .all();
  for (const sheet of sheets) {
    db.delete(schema.guidancePolicyMemos)
      .where(eq(schema.guidancePolicyMemos.sheetId, sheet.id))
      .run();
    db.delete(schema.guidancePolicySheets)
      .where(eq(schema.guidancePolicySheets.id, sheet.id))
      .run();
  }
}
