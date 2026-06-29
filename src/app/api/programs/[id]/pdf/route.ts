import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { resolveProgramSheetExportDir } from "@/lib/desktop-path";
import { buildPdfFilename } from "@/lib/months";
import {
  disposePdfBrowser,
  resolvePdfBaseUrl,
  writeProgramSheetPdf,
} from "@/lib/pdf-export";
import { formatUnfilledMonthsError } from "@/lib/pdf-sheet-utils";
import {
  getProgramSheet,
  getUnfilledMonthLabels,
  recordProgramSheetPdfExport,
} from "@/lib/programs";
import { userCanViewProgramSheet } from "@/lib/teacher-overview";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const sheet = getProgramSheet(id);
  if (!sheet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    !userCanViewProgramSheet(
      id,
      session.id,
      session.memberRole,
      session.role,
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const unfilledLabels = getUnfilledMonthLabels(sheet.months);
  if (unfilledLabels.length > 0) {
    return NextResponse.json(
      { error: formatUnfilledMonthsError(unfilledLabels) },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filenameBase = buildPdfFilename({
    studentName: sheet.student.name,
    gender: sheet.student.gender,
    subject: sheet.subject,
    grade: sheet.student.grade,
    startYearMonth: sheet.startYearMonth,
    teacherName: sheet.teacher.name,
  });

  let browser;
  try {
    const result = await writeProgramSheetPdf({
      sheetId: id,
      filenameBase,
      sessionToken,
      baseUrl: resolvePdfBaseUrl(request),
    });
    browser = result.browser;
    const pdfExportedAt = recordProgramSheetPdfExport(id);

    return NextResponse.json({
      ok: true,
      folder: resolveProgramSheetExportDir(),
      fileName: result.fileName,
      pdfExportedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "PDFの作成に失敗しました",
      },
      { status: 500 },
    );
  } finally {
    await disposePdfBrowser(browser);
  }
}
