import type { ReactNode } from "react";
import { AppHeaderShell } from "@/components/AppHeaderShell";
import { getSession } from "@/lib/auth";
import {
  canEditTestSchedule,
  canViewTestSchedule,
} from "@/lib/test-schedule-access";

export async function AppHeader({
  title,
  meta,
}: {
  title: string;
  meta?: ReactNode;
}) {
  const session = await getSession();

  return (
    <AppHeaderShell
      title={title}
      userLine={
        session
          ? `${session.name}（${session.memberRole || (session.role === "admin" ? "管理者" : "講師")}）`
          : undefined
      }
      meta={meta}
      showMemberAdminLink={session?.role === "admin"}
      showTestScheduleLink={canViewTestSchedule(session)}
      testScheduleReadOnly={!canEditTestSchedule(session)}
    />
  );
}
