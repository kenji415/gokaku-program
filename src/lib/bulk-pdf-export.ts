import { and, eq, isNull } from "drizzle-orm";
import type { Browser } from "puppeteer";
import { resolveProgramSheetExportDir } from "@/lib/desktop-path";
import { buildPdfFilename } from "@/lib/months";
import { disposePdfBrowser, writeProgramSheetPdf } from "@/lib/pdf-export";
import {
  findOrCreateProgramSheet,
  getUnfilledMonthLabels,
  recordProgramSheetPdfExport,
} from "@/lib/programs";
import { formatUnfilledMonthsError } from "@/lib/pdf-sheet-utils";
import { releaseRuntimeMemory } from "@/lib/runtime-memory";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/** 何件ごとに Puppeteer の Chrome を再起動するか（メモリ肥大化防止） */
const BULK_PDF_BROWSER_RECYCLE_EVERY = 3;

export type BulkPdfExportParams = {
  startYearMonth: string;
  subject: string;
  studentIds: string[];
  teacherId: string;
  teacherName: string;
  sessionToken: string;
  baseUrl: string;
};

export type BulkPdfCreatedItem = {
  studentId: string;
  name: string;
  fileName: string;
  pdfExportedAt: string;
};

export type BulkPdfFailedItem = {
  studentId: string;
  name: string;
  error: string;
};

async function processBulkPdfStudent(params: {
  studentId: string;
  subject: string;
  startYearMonth: string;
  teacherId: string;
  teacherName: string;
  sessionToken: string;
  baseUrl: string;
  browser: Browser | undefined;
  created: BulkPdfCreatedItem[];
  failed: BulkPdfFailedItem[];
}): Promise<Browser | undefined> {
  const db = getDb();
  const {
    studentId,
    subject,
    startYearMonth,
    teacherId,
    teacherName,
    sessionToken,
    baseUrl,
    created,
    failed,
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
    const sheet = findOrCreateProgramSheet({
      studentId,
      subject,
      teacherId,
      startYearMonth,
    });

    const unfilledLabels = getUnfilledMonthLabels(sheet.months);
    if (unfilledLabels.length > 0) {
      failed.push({
        studentId,
        name: student.name,
        error: formatUnfilledMonthsError(unfilledLabels),
      });
      return browser;
    }

    const filenameBase = buildPdfFilename({
      studentName: sheet.student.name,
      gender: sheet.student.gender,
      subject: sheet.subject,
      grade: sheet.student.grade,
      startYearMonth: sheet.startYearMonth,
      teacherName,
    });

    const result = await writeProgramSheetPdf({
      sheetId: sheet.id,
      filenameBase,
      sessionToken,
      baseUrl,
      browser,
    });
    browser = result.browser;

    const pdfExportedAt = recordProgramSheetPdfExport(sheet.id);
    created.push({
      studentId,
      name: student.name,
      fileName: result.fileName,
      pdfExportedAt,
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

export async function runBulkPdfExport(
  params: BulkPdfExportParams,
  emit: (payload: object) => void,
): Promise<void> {
  const created: BulkPdfCreatedItem[] = [];
  const failed: BulkPdfFailedItem[] = [];
  let browser: Browser | undefined;
  const total = params.studentIds.length;

  emit({ type: "progress", done: 0, total });

  for (let index = 0; index < params.studentIds.length; index += 1) {
    if (index > 0 && index % BULK_PDF_BROWSER_RECYCLE_EVERY === 0) {
      await disposePdfBrowser(browser);
      browser = undefined;
      releaseRuntimeMemory();
    }

    browser = await processBulkPdfStudent({
      studentId: params.studentIds[index],
      subject: params.subject,
      startYearMonth: params.startYearMonth,
      teacherId: params.teacherId,
      teacherName: params.teacherName,
      sessionToken: params.sessionToken,
      baseUrl: params.baseUrl,
      browser,
      created,
      failed,
    });
    emit({ type: "progress", done: index + 1, total });
  }

  emit({
    type: "result",
    ok: failed.length === 0,
    folder: resolveProgramSheetExportDir(),
    created,
    failed,
  });

  await disposePdfBrowser(browser);
  releaseRuntimeMemory();
}
