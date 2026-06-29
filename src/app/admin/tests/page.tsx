import { AppHeader } from "@/components/AppHeader";
import { TestScheduleSpreadsheet } from "@/components/admin/TestScheduleSpreadsheet";
import { getSession } from "@/lib/auth";
import {
  canEditTestSchedule,
  canViewTestSchedule,
} from "@/lib/test-schedule-access";
import { listTestSchedules } from "@/lib/tests";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminTestsPage() {
  const session = await getSession();
  if (!session || !canViewTestSchedule(session)) {
    redirect("/maker");
  }

  const canEdit = canEditTestSchedule(session);
  const tests = listTestSchedules();

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader title="テスト日程マスタ" />
      <main className="p-6">
        {canEdit ? (
          <p className="mb-4 text-sm text-gray-600">
            スプレッドシートと同じ感覚で一覧入力できます。塾名は候補から選ぶか、リストにない場合は手入力できます。
            「テストコースに含める」にチェックを入れたテストだけが、生徒のテストパターンに応じたプログラムシートの候補になります。
            講師がプログラムシートから追加したテストは、塾名を入れて登録されますが、チェックが入るまではテストコースには含まれません。
            表示順は塾別（SAPIX→四谷大塚→早稲田アカデミー→…）→
            学年（6年から下へ）→ 開催日時（古い順）です。
          </p>
        ) : (
          <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            閲覧専用です。テストの追加・編集・削除は管理者のみ行えます。誤って削除すると、紐づく成績入力などに影響する可能性があります。
          </p>
        )}
        <TestScheduleSpreadsheet
          readOnly={!canEdit}
          initialRows={tests.map((t) => ({
            id: t.id,
            cramSchool: t.cramSchool ?? "",
            grade: t.grade,
            testName: t.testName,
            testDate: t.testDate ?? "",
            yearMonth: t.yearMonth,
            displayText: t.displayText,
            inTestCourse: t.inTestCourse === 1,
          }))}
        />
      </main>
    </div>
  );
}
