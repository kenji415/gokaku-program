import { ProgramSheetPrintView } from "@/components/ProgramSheetPrintView";
import { getSession } from "@/lib/auth";
import { normalizeProgramContentFontSize } from "@/lib/program-content-font";
import { getProgramSheet } from "@/lib/programs";
import { userCanViewProgramSheet } from "@/lib/teacher-overview";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProgramSheetPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ contentFontSize?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const query = await searchParams;
  const sheet = getProgramSheet(id);

  if (!sheet) notFound();

  if (
    !userCanViewProgramSheet(
      id,
      session.id,
      session.memberRole,
      session.role,
    )
  ) {
    notFound();
  }

  const contentFontSize =
    query.contentFontSize !== undefined
      ? normalizeProgramContentFontSize(query.contentFontSize)
      : normalizeProgramContentFontSize(sheet.contentFontSize);

  return (
    <ProgramSheetPrintView sheet={sheet} contentFontSize={contentFontSize} />
  );
}
