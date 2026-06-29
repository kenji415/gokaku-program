import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { resolveFinalStretchExportDir } from "@/lib/desktop-path";
import {
  getFinalStretchSheet,
  recordFinalStretchPdfExport,
  userCanAccessFinalStretchSheet,
} from "@/lib/final-stretch";
import { buildFinalStretchPdfFilename } from "@/lib/months";
import {
  disposePdfBrowser,
  resolvePdfBaseUrl,
  writeFinalStretchSheetPdf,
} from "@/lib/pdf-export";

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
  const sheet = getFinalStretchSheet(id);
  if (!sheet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    !userCanAccessFinalStretchSheet(
      id,
      session.id,
      session.memberRole,
      session.role,
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filenameBase = buildFinalStretchPdfFilename({
    studentName: sheet.student.name,
    gender: sheet.student.gender,
    subject: sheet.subject,
    grade: sheet.student.grade,
    teacherName: sheet.teacher.name,
  });

  let browser;
  try {
    const result = await writeFinalStretchSheetPdf({
      sheetId: id,
      filenameBase,
      sessionToken,
      baseUrl: resolvePdfBaseUrl(request),
    });
    browser = result.browser;
    const pdfExportedAt = recordFinalStretchPdfExport(id);

    return NextResponse.json({
      ok: true,
      folder: resolveFinalStretchExportDir(),
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
