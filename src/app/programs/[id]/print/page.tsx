import { ProgramSheetPrintView } from "@/components/ProgramSheetPrintView";
import { getSession } from "@/lib/auth";
import { getProgramSheet } from "@/lib/programs";
import { userCanViewProgramSheet } from "@/lib/teacher-overview";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProgramSheetPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
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

  return <ProgramSheetPrintView sheet={sheet} />;
}
