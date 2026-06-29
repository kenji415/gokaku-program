"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/LogoutButton";

export function AppHeaderShell({
  title,
  userLine,
  meta,
  navBeforeLogout,
  navAfterAdmin,
  showMemberAdminLink = false,
  showTestScheduleLink = false,
  testScheduleReadOnly = false,
  /** @deprecated use showMemberAdminLink + showTestScheduleLink */
  showAdminLinks = false,
}: {
  title: string;
  userLine?: string;
  meta?: ReactNode;
  navBeforeLogout?: ReactNode;
  navAfterAdmin?: ReactNode;
  showMemberAdminLink?: boolean;
  showTestScheduleLink?: boolean;
  testScheduleReadOnly?: boolean;
  showAdminLinks?: boolean;
}) {
  const showMembers = showMemberAdminLink || showAdminLinks;
  const showTests = showTestScheduleLink || showAdminLinks;

  return (
    <header className="border-b bg-[#1e3a5f] px-6 py-3 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{title}</h1>
          {userLine ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-sm text-white/80">{userLine}</p>
              {meta}
            </div>
          ) : null}
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/maker" className="hover:underline">
            メーカー
          </Link>
          {navBeforeLogout}
          {showMembers ? (
            <Link href="/admin/members" className="hover:underline">
              メンバー
            </Link>
          ) : null}
          {showTests ? (
            <Link href="/admin/tests" className="hover:underline">
              テスト日程
              {testScheduleReadOnly ? (
                <span className="sr-only">（閲覧のみ）</span>
              ) : null}
            </Link>
          ) : null}
          {navAfterAdmin}
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
