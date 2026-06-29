import { MakerClient } from "@/components/MakerClient";
import { TeacherDefaultCampusProvider } from "@/components/TeacherDefaultCampus";
import { getSession } from "@/lib/auth";
import { getTeacherAssignments } from "@/lib/programs";
import { repairBrokenStudentsInDb } from "@/lib/students";
import { getTeacherDefaultCampus } from "@/lib/teachers";
import { canViewTeacherOverview } from "@/lib/teacher-overview";
import { canViewTestSchedule } from "@/lib/test-schedule-access";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "プログラムメーカー | 合格プログラム",
};

export default async function MakerPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  repairBrokenStudentsInDb();

  const assignments = getTeacherAssignments(session.id);

  const defaultCampus = getTeacherDefaultCampus(session.id);
  const showMakerCampusField =
    Boolean(session.memberRole) || session.role === "teacher";
  const roleLabel =
    session.memberRole || (session.role === "admin" ? "管理者" : "講師");

  return (
    <TeacherDefaultCampusProvider initialDefaultCampus={defaultCampus}>
      <Suspense
        fallback={
          <div className="p-8 text-center text-gray-500">読み込み中…</div>
        }
      >
        <MakerClient
          teacherId={session.id}
          teacherName={session.name}
          roleLabel={roleLabel}
          isAdmin={session.role === "admin"}
          showMakerCampusField={showMakerCampusField}
          assignments={assignments}
          canViewTeacherOverview={canViewTeacherOverview(session.memberRole)}
          showAdminTeacherSearch={session.memberRole === "管理者"}
          showTestScheduleLink={canViewTestSchedule(session)}
          testScheduleReadOnly={session.role !== "admin"}
        />
      </Suspense>
    </TeacherDefaultCampusProvider>
  );
}
