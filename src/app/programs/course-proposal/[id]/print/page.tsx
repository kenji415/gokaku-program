import { CourseProposalSheetPrintView } from "@/components/CourseProposalSheetPrintView";
import { getSession } from "@/lib/auth";
import {
  getCourseProposalSheet,
  userCanAccessCourseProposalSheet,
} from "@/lib/course-proposal";
import { buildCourseProposalPdfFilename } from "@/lib/months";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const sheet = getCourseProposalSheet(id);
  if (!sheet) return { title: "講習提案書" };

  return {
    title: buildCourseProposalPdfFilename({
      year: sheet.year,
      season: sheet.season,
      studentName: sheet.student.name,
      gender: sheet.student.gender,
    }),
  };
}

export default async function CourseProposalSheetPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const sheet = getCourseProposalSheet(id);

  if (!sheet) notFound();

  if (
    !userCanAccessCourseProposalSheet(
      id,
      session.id,
      session.memberRole,
      session.role,
    )
  ) {
    notFound();
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `@page { size: B5 portrait; margin: 0; }`,
        }}
      />
      <CourseProposalSheetPrintView sheet={sheet} />
    </>
  );
}
