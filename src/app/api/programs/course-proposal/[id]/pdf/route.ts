import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth-session";
import {
  getCourseProposalSheet,
  recordCourseProposalPdfExport,
  userCanAccessCourseProposalSheet,
} from "@/lib/course-proposal";
import { buildCourseProposalPdfFilename } from "@/lib/months";
import { pdfDownloadResponse } from "@/lib/pdf-download-response";
import {
  renderCourseProposalSheetPdf,
  releasePdfBrowser,
  resolvePdfBaseUrl,
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
  const sheet = getCourseProposalSheet(id);
  if (!sheet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    !userCanAccessCourseProposalSheet(
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

  const filenameBase = buildCourseProposalPdfFilename({
    year: sheet.year,
    season: sheet.season,
    studentName: sheet.student.name,
    gender: sheet.student.gender,
  });

  let browser;
  try {
    const result = await renderCourseProposalSheetPdf({
      sheetId: id,
      filenameBase,
      sessionToken,
      baseUrl: resolvePdfBaseUrl(request),
    });
    browser = result.browser;
    const pdfExportedAt = recordCourseProposalPdfExport(id);
    const response = pdfDownloadResponse(result.buffer, result.fileName, {
      "X-Pdf-Exported-At": pdfExportedAt,
    });
    releasePdfBrowser(browser);
    browser = undefined;
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "PDFの作成に失敗しました",
      },
      { status: 500 },
    );
  } finally {
    releasePdfBrowser(browser);
  }
}
