import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, type SessionUser } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { createBulkCourseProposalPdfExportStream } from "@/lib/bulk-course-proposal-pdf-spawn";
import {
  getBulkCourseProposalPdfStudentStatuses,
  isCourseProposalSeason,
  type CourseProposalSeason,
} from "@/lib/course-proposal";
import { resolvePdfBaseUrl } from "@/lib/pdf-export";

export const runtime = "nodejs";
export const maxDuration = 300;

type BulkCourseProposalPdfRequest = {
  year: number;
  season: CourseProposalSeason;
  studentIds: string[];
};

function canUseBulkPdf(session: SessionUser): boolean {
  return session.role === "teacher" || Boolean(session.memberRole);
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseBulkPdf(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year"));
  const season = searchParams.get("season")?.trim() ?? "";

  if (!Number.isFinite(year) || !isCourseProposalSeason(season)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const statuses = getBulkCourseProposalPdfStudentStatuses(
    session.id,
    year,
    season,
  );

  return NextResponse.json({ statuses });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseBulkPdf(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as BulkCourseProposalPdfRequest;
  const year = Number(body.year);
  const season = body.season;
  const studentIds = [...new Set(body.studentIds ?? [])];

  if (
    !Number.isFinite(year) ||
    !isCourseProposalSeason(season) ||
    studentIds.length === 0
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stream = createBulkCourseProposalPdfExportStream({
    year,
    season,
    studentIds,
    teacherId: session.id,
    sessionToken,
    baseUrl: resolvePdfBaseUrl(request),
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
