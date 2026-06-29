import { FinalStretchSheetPrintView } from "@/components/FinalStretchSheetPrintView";
import { getSession } from "@/lib/auth";
import {
  getFinalStretchSheet,
  userCanAccessFinalStretchSheet,
} from "@/lib/final-stretch";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FinalStretchSheetPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const sheet = getFinalStretchSheet(id);

  if (!sheet) notFound();

  if (
    !userCanAccessFinalStretchSheet(
      id,
      session.id,
      session.memberRole,
      session.role,
    )
  ) {
    notFound();
  }

  return <FinalStretchSheetPrintView sheet={sheet} />;
}
