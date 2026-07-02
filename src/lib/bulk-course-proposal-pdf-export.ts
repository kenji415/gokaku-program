import { and, eq, isNull } from "drizzle-orm";
import type { Browser } from "puppeteer";
import {
  findOrCreateCourseProposalSheet,
  isCourseProposalSeason,
  recordCourseProposalPdfExport,
  type CourseProposalSeason,
} from "@/lib/course-proposal";
import { buildCourseProposalPdfFilename } from "@/lib/months";
import { disposePdfBrowser, renderCourseProposalSheetPdf } from "@/lib/pdf-export";
import { releaseRuntimeMemory } from "@/lib/runtime-memory";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { teacherCanAccessStudent } from "@/lib/test-results";

const BULK_PDF_BROWSER_RECYCLE_EVERY = 3;

export type BulkCourseProposalPdfExportParams = {
  year: number;
  season: CourseProposalSeason;
  studentIds: string[];
  teacherId: string;
  sessionToken: string;
  baseUrl: string;
};

export type BulkCourseProposalPdfCreatedItem = {
  studentId: string;
  name: string;
  fileName: string;
  pdfExportedAt: string;
};

export type BulkCourseProposalPdfFailedItem = {
  studentId: string;
  name: string;
  error: string;
};

async function processBulkCourseProposalStudent(params: {
  year: number;
  season: CourseProposalSeason;
  studentId: string;
  teacherId: string;
  sessionToken: string;
  baseUrl: string;
  browser: Browser | undefined;
  created: BulkCourseProposalPdfCreatedItem[];
  failed: BulkCourseProposalPdfFailedItem[];
  emit?: (payload: object) => void;
}): Promise<Browser | undefined> {
  const db = getDb();
  const {
    year,
    season,
    studentId,
    teacherId,
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

  if (!teacherCanAccessStudent(teacherId, studentId)) {
    failed.push({
      studentId,
      name: student.name,
      error: "担当が確認できません",
    });
    return browser;
  }

  try {
    const sheet = findOrCreateCourseProposalSheet({
      studentId,
      teacherId,
      year,
      season,
    });

    const filenameBase = buildCourseProposalPdfFilename({
      year: sheet.year,
      season: sheet.season,
      studentName: sheet.student.name,
      gender: sheet.student.gender,
    });

    const result = await renderCourseProposalSheetPdf({
      sheetId: sheet.id,
      filenameBase,
      sessionToken,
      baseUrl,
      browser,
    });
    browser = result.browser;

    const pdfExportedAt = recordCourseProposalPdfExport(sheet.id);
    const item: BulkCourseProposalPdfCreatedItem = {
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

export async function runBulkCourseProposalPdfExport(
  params: BulkCourseProposalPdfExportParams,
  emit: (payload: object) => void,
): Promise<void> {
  if (!isCourseProposalSeason(params.season)) {
    emit({
      type: "result",
      ok: false,
      created: [],
      failed: [
        {
          studentId: "",
          name: "",
          error: "講習期が不正です",
        },
      ],
    });
    return;
  }

  const created: BulkCourseProposalPdfCreatedItem[] = [];
  const failed: BulkCourseProposalPdfFailedItem[] = [];
  let browser: Browser | undefined;
  const total = params.studentIds.length;

  emit({ type: "progress", done: 0, total });

  for (let index = 0; index < params.studentIds.length; index += 1) {
    if (index > 0 && index % BULK_PDF_BROWSER_RECYCLE_EVERY === 0) {
      await disposePdfBrowser(browser);
      browser = undefined;
      releaseRuntimeMemory();
    }

    browser = await processBulkCourseProposalStudent({
      year: params.year,
      season: params.season,
      studentId: params.studentIds[index],
      teacherId: params.teacherId,
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
