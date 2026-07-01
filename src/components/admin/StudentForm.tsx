"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CRAM_SCHOOL_NAMES, GRADES, GENDERS, SUBJECTS } from "@/lib/constants";
import { useTestScheduleCramSchoolNames } from "@/hooks/use-test-schedule-cram-schools";
import { useAutoSave } from "@/hooks/use-auto-save";
import { TeacherAssignmentInput } from "@/components/TeacherAssignmentInput";
import { teacherDisplayName } from "@/lib/teacher-assignment";

type Teacher = { id: string; name: string };

type AssignmentRow = {
  subject: string;
  teacherId: string;
};

type StudentFormProps = {
  initial?: {
    name: string;
    gender: string;
    grade: string;
    cramSchool: string;
    campus: string;
    className: string;
    mockExamPattern: string;
    initialChallenges: string;
  };
  initialAssignments?: AssignmentRow[];
  teachers: Teacher[];
  studentId?: string;
};

export function StudentForm({
  initial,
  initialAssignments = [],
  teachers,
  studentId,
}: StudentFormProps) {
  const router = useRouter();
  const testScheduleCramSchools = useTestScheduleCramSchoolNames();
  const [savedStudentId, setSavedStudentId] = useState(studentId);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    gender: initial?.gender ?? "",
    grade: initial?.grade ?? "6年",
    cramSchool: initial?.cramSchool ?? "",
    campus: initial?.campus ?? "",
    className: initial?.className ?? "",
    mockExamPattern: initial?.mockExamPattern ?? "",
    initialChallenges: initial?.initialChallenges ?? "",
  });

  const [assignments, setAssignments] = useState<AssignmentRow[]>(() => {
    const map = new Map(initialAssignments.map((a) => [a.subject, a.teacherId]));
    return SUBJECTS.map((subject) => ({
      subject,
      teacherId: map.get(subject) ?? "",
    }));
  });

  const [error, setError] = useState("");
  const [saveRevision, setSaveRevision] = useState(0);
  const formRef = useRef(form);
  const assignmentsRef = useRef(assignments);
  formRef.current = form;
  assignmentsRef.current = assignments;

  const bumpSave = () => setSaveRevision((r) => r + 1);

  const persistStudent = useCallback(async (): Promise<boolean> => {
    const currentForm = formRef.current;
    const currentAssignments = assignmentsRef.current;

    if (!currentForm.name.trim()) {
      return true;
    }

    setError("");

    const payload = {
      ...currentForm,
      goal: "志望校合格に向けて",
      assignments: currentAssignments.filter((a) => a.teacherId),
    };

    const res = await fetch(
      savedStudentId
        ? `/api/admin/students/${savedStudentId}`
        : "/api/admin/students",
      {
        method: savedStudentId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "自動保存に失敗しました");
      return false;
    }

    if (!savedStudentId) {
      const data = (await res.json()) as { id: string };
      setSavedStudentId(data.id);
      router.replace(`/admin/students/${data.id}/edit`);
    }

    return true;
  }, [router, savedStudentId]);

  const { statusLabel: autoSaveLabel } = useAutoSave(persistStudent, saveRevision);

  useEffect(() => {
    setSavedStudentId(studentId);
  }, [studentId]);

  const updateForm = (patch: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    bumpSave();
  };

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="mx-auto max-w-2xl space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <label className="col-span-2 text-sm">
          生徒名 *
          <input
            required
            className="mt-1 w-full rounded border px-3 py-2"
            value={form.name}
            onChange={(e) => updateForm({ name: e.target.value })}
            placeholder="受験　太郎"
          />
        </label>

        <label className="text-sm">
          性別
          <select
            className="mt-1 w-full rounded border px-3 py-2"
            value={form.gender}
            onChange={(e) => updateForm({ gender: e.target.value })}
          >
            <option value="">—</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          学年 *
          <select
            required
            className="mt-1 w-full rounded border px-3 py-2"
            value={form.grade}
            onChange={(e) => updateForm({ grade: e.target.value })}
          >
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          塾
          <input
            list="cram-school-list"
            className="mt-1 w-full rounded border px-3 py-2"
            value={form.cramSchool}
            onChange={(e) => updateForm({ cramSchool: e.target.value })}
          />
        </label>

        <label className="text-sm">
          校舎
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            value={form.campus}
            onChange={(e) => updateForm({ campus: e.target.value })}
          />
        </label>

        <label className="text-sm">
          クラス
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            value={form.className}
            onChange={(e) => updateForm({ className: e.target.value })}
          />
        </label>

        <label className="text-sm">
          模試パターン
          <input
            list="mock-exam-pattern-list"
            className="mt-1 w-full rounded border px-3 py-2"
            value={form.mockExamPattern}
            onChange={(e) => updateForm({ mockExamPattern: e.target.value })}
          />
          <span className="mt-1 block text-xs text-gray-500">
            設定すると、プログラム新規作成時にテスト日程マスタから
            「塾名（この値）×学年」一致の模試を各月に自動入力します
          </span>
        </label>

        <label className="col-span-2 text-sm">
          開始時の課題
          <textarea
            rows={5}
            className="mt-1 w-full rounded border px-3 py-2"
            value={form.initialChallenges}
            onChange={(e) => updateForm({ initialChallenges: e.target.value })}
          />
          <span className="mt-1 block text-xs text-gray-500">
            自由記述。指導開始時ボックスにそのまま表示されます。
          </span>
        </label>
      </div>

      <datalist id="cram-school-list">
        {CRAM_SCHOOL_NAMES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <datalist id="mock-exam-pattern-list">
        {testScheduleCramSchools.map((name) => (
          <option key={name} value={name} />
        ))}
        {form.mockExamPattern &&
        !testScheduleCramSchools.includes(form.mockExamPattern) ? (
          <option value={form.mockExamPattern}>{form.mockExamPattern}</option>
        ) : null}
      </datalist>

      <fieldset className="rounded border p-4">
        <legend className="px-2 text-sm font-medium">科目別担当講師</legend>
        <p className="mb-3 text-xs text-gray-500">
          同一科目は1名のみ。講師名を入力すると候補が表示されます。割当すると講師のメーカーに表示されます。
        </p>
        <div className="space-y-2">
          {assignments.map((row, i) => (
            <div key={row.subject} className="flex items-center gap-3 text-sm">
              <span className="w-12">{row.subject}</span>
              <TeacherAssignmentInput
                teacherId={row.teacherId}
                teacherName={teacherDisplayName(row.teacherId, teachers)}
                options={teachers}
                className="flex-1 rounded border px-2 py-1"
                onChange={(teacherId) => {
                  const next = [...assignments];
                  next[i] = { ...row, teacherId };
                  setAssignments(next);
                  bumpSave();
                }}
              />
            </div>
          ))}
        </div>
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {autoSaveLabel && (
        <p className="text-sm text-green-700">{autoSaveLabel}</p>
      )}
      {!savedStudentId && (
        <p className="text-xs text-gray-500">
          生徒名を入力すると自動的に登録されます。
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.push("/admin/students")}
          className="rounded border px-4 py-2"
        >
          一覧へ戻る
        </button>
      </div>
    </form>
  );
}
