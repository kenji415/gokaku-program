import { AppHeader } from "@/components/AppHeader";
import { MemberSpreadsheet } from "@/components/admin/MemberSpreadsheet";
import { listMembers } from "@/lib/members";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "メンバー管理 | 合格プログラム",
};

export default async function AdminMembersPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/maker");
  }

  const members = listMembers();

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader title="メンバー管理" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <MemberSpreadsheet initialRows={members} />
      </main>
    </div>
  );
}
