import { and, eq, isNull } from "drizzle-orm";
import type { Browser } from "puppeteer";
import {
  findOrCreateFinalStretchSheet,
  isFinalStretchGrade,
  recordFinalStretchPdfExport,
} from "@/lib/final-stretch";
import { buildFinalStretchPdfFilename } from "@/lib/months";
import { disposePdfBrowser, renderFinalStretchSheetPdf } from "@/lib/pdf-export";
import { releaseRuntimeMemory } from "@/lib/runtime-memory";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
const BULK_PDF_BROWSER_RECYCLE_EVERY = 3;

export type BulkFinalStretchPdfExportParams = {
  subject: string;
  studentIds: string[];
  teacherId: string;
  teacherName: string;
  sessionToken: string;
  baseUrl: string;
};

export type BulkFinalStretchPdfCreatedItem = {
  studentId: string;
  name: string;
  fileName: string;
  pdfExportedAt: string;
};

export type BulkFinalStretchPdfFailedItem = {
  studentId: string;
  name: string;
  error: string;
};

async function processBulkFinalStretchPdfStudent(params: {
  studentId: string;
  subject: string;
  teacherId: string;
  teacherName: string;
  sessionToken: string;
  baseUrl: string;
  browser: Browser | undefined;
  created: BulkFinalStretchPdfCreatedItem[];
  failed: BulkFinalStretchPdfFailedItem[];
  emit?: (payload: object) => void;
}): Promise<Browser | undefined> {
  const db = getDb();
  const {
    studentId,
    subject,
    teacherId,
    teacherName,
    sessionToken,
    baseUrl,
    created,
    failed,
    emit,
  } = params;
  let browser = params.browser;

  const student = db
    .select()
    .from(schema.students)
    .where(
      and(eq(schema.students.id, studentId), isNull(schema.students.graduatedAt)),
    )
    .get();

  if (!student) {
    failed.push({
      studentId,
      name: "",
      error: "生徒が見つからないか、卒塾生です",
    });
    return browser;
  }

  if (!isFinalStretchGrade(student.grade)) {
    failed.push({
      studentId,
      name: student.name,
      error: "6年生ではありません",
    });
    return browser;
  }

  const assignment = db
    .select()
    .from(schema.studentAssignments)
    .where(
      and(
        eq(schema.studentAssignments.studentId, studentId),
        eq(schema.studentAssignments.subject, subject),
        eq(schema.studentAssignments.teacherId, teacherId),
      ),
    )
    .get();

  if (!assignment) {
    failed.push({
      studentId,
      name: student.name,
      error: "担当が確認できません",
    });
    return browser;
  }

  try {
    const sheet = findOrCreateFinalStretchSheet({
      studentId,
      subject,
      teacherId,
    });

    const filenameBase = buildFinalStretchPdfFilename({
      studentName: sheet.student.name,
      gender: sheet.student.gender,
      subject: sheet.subject,
      grade: sheet.student.grade,
      teacherName,
    });

    const result = await renderFinalStretchSheetPdf({
      sheetId: sheet.id,
      filenameBase,
      sessionToken,
      baseUrl,
      browser,
    });
    browser = result.browser;

    const pdfExportedAt = recordFinalStretchPdfExport(sheet.id);
    const item: BulkFinalStretchPdfCreatedItem = {
      studentId,
      name: student.name,
      fileName: result.fileName,
      pdfExportedAt,
    };
    created.push(item);
    emit?.({
      type: "pdf",
      studentId: item.studentId,
      name: item.name,
      fileName: item.fileName,
      pdfExportedAt: item.pdfExportedAt,
      data: result.buffer.toString("base64"),
    });
  } catch (error) {
    failed.push({
      studentId,
      name: student.name,
      error:
        error instanceof Error ? error.message : "PDFの作成に失敗しました",
    });
  }

  return browser;
}

export async function runBulkFinalStretchPdfExport(
  params: BulkFinalStretchPdfExportParams,
  emit: (payload: object) => void,
): Promise<void> {
  const created: BulkFinalStretchPdfCreatedItem[] = [];
  const failed: BulkFinalStretchPdfFailedItem[] = [];
  let browser: Browser | undefined;
  const total = params.studentIds.length;

  emit({ type: "progress", done: 0, total });

  for (let index = 0; index < params.studentIds.length; index += 1) {
    if (index > 0 && index % BULK_PDF_BROWSER_RECYCLE_EVERY === 0) {
      await disposePdfBrowser(browser);
      browser = undefined;
      releaseRuntimeMemory();
    }

    browser = await processBulkFinalStretchPdfStudent({
      studentId: params.studentIds[index],
      subject: params.subject,
      teacherId: params.teacherId,
      teacherName: params.teacherName,
      sessionToken: params.sessionToken,
      baseUrl: params.baseUrl,
      browser,
      created,
      failed,
      emit,
    });
    emit({ type: "progress", done: index + 1, total });
  }

  emit({
    type: "result",
    ok: failed.length === 0,
    created,
    failed,
  });

  await disposePdfBrowser(browser);
  releaseRuntimeMemory();
}
