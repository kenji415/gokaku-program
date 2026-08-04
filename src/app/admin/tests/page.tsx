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
            プログラムシートのテスト編集には、学年・月が一致する登録済み模試がすべて候補として出ます。
            「テストコースに含める」にチェックしたテストは、同じ模試パターンの生徒の該当月に自動追加されます（既に他のテストがあっても追加。テスト編集で外したものは再追加しません）。
            全員が受けない模試は登録だけしてチェックを外してください。
            表示順は塾別（SAPIX→四谷大塚→早稲田アカデミー→…）→
            学年（6年から下へ）→ 開催日時（古い順）です。
          </p>
        ) : (
          <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            閲覧専用です。テスト日程マスタの一括追加・編集・削除は管理者のみ行えます。
            個別にテストを追加したい場合は、プログラムメーカーの月ボックス「テスト編集」→「＋新規テスト」から登録できます。
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
