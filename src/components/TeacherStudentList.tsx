"use client";

import { useEffect, useMemo, useState } from "react";
import type { MakerStudentListItem } from "@/lib/programs";
import { formatGraduationYear } from "@/lib/graduation";
import { SUBJECTS } from "@/lib/constants";

type SelectOptions = {
  tab: "basic" | "program";
  subject?: string;
};

type Props = {
  selectedStudentId: string;
  extraStudents: Map<string, { name: string; grade: string }>;
  onSelectStudent: (
    student: MakerStudentListItem,
    options: SelectOptions,
  ) => void;
  onCreateNew: (initialName?: string) => void;
};

export function TeacherStudentList({
  selectedStudentId,
  extraStudents,
  onSelectStudent,
  onCreateNew,
}: Props) {
  const [students, setStudents] = useState<MakerStudentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [includeGraduated, setIncludeGraduated] = useState(false);
  const [assignSubject, setAssignSubject] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const handleAssignSelf = async (
    student: MakerStudentListItem,
    subject: string,
  ) => {
    if (!subject) return;
    setAssigningId(student.id);
    try {
      let res = await fetch(
        `/api/programs/students/${student.id}/assign-self`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject }),
        },
      );

      if (res.status === 409) {
        const data = (await res.json()) as { teacherName?: string };
        const teacherName = data.teacherName ?? "他の講師";
        if (
          !window.confirm(
            `${subject}は${teacherName}先生が担当中です。あなたに引き継ぎますか？`,
          )
        ) {
          return;
        }
        res = await fetch(
          `/api/programs/students/${student.id}/assign-self`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject, force: true }),
          },
        );
      }

      if (!res.ok) return;
      onSelectStudent(student, { tab: "program", subject });
    } finally {
      setAssigningId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadError("");
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (includeGraduated) params.set("includeGraduated", "1");
      const url = params.size
        ? `/api/programs/students/list?${params}`
        : "/api/programs/students/list";

      fetch(url)
        .then(async (res) => {
          if (!res.ok) throw new Error("load failed");
          return res.json() as Promise<{ students: MakerStudentListItem[] }>;
        })
        .then((data) => {
          if (!cancelled) setStudents(data.students);
        })
        .catch(() => {
          if (!cancelled) setLoadError("生徒一覧を読み込めませんでした");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, includeGraduated]);

  const mergedStudents = useMemo(() => {
    const byId = new Map(students.map((s) => [s.id, s]));
    for (const [id, { name, grade }] of extraStudents) {
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          name,
          grade,
          gender: null,
          cramSchool: "",
          campus: "",
          className: "",
          targetSchool: "",
          mySubjects: [],
          graduatedAt: null,
        });
      }
    }
    const active = [...byId.values()]
      .filter((s) => !s.graduatedAt)
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
    const archived = [...byId.values()]
      .filter((s) => s.graduatedAt)
      .sort((a, b) => {
        const aTime = Date.parse(a.graduatedAt ?? "");
        const bTime = Date.parse(b.graduatedAt ?? "");
        if (aTime !== bTime) return bTime - aTime;
        return a.name.localeCompare(b.name, "ja");
      });
    return [...active, ...archived];
  }, [students, extraStudents]);

  return (
    <div className="mx-auto max-w-6xl px-2">
      <div className="rounded border bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">生徒一覧</h2>
            <p className="mt-1 text-xs text-gray-500">
              氏名をクリックで基本情報、担当科目をクリックでプログラムシートを開きます。検索で担当外の生徒も氏名一致なら表示されます（姓名の間のスペースは不要）。担当外の生徒は科目を選んで「担当に加わる」で自分の担当に追加できます。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              className="rounded border border-gray-300 px-3 py-1.5 text-sm"
              placeholder="氏名・学年などで検索…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="生徒を検索"
            />
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeGraduated}
                onChange={(e) => setIncludeGraduated(e.target.checked)}
              />
              卒塾生含む
            </label>
            <button
              type="button"
              className="rounded border border-[#1e3a5f] bg-white px-3 py-1.5 text-sm text-[#1e3a5f] hover:bg-gray-50"
              onClick={() => onCreateNew(query.trim())}
            >
              ＋ 新規登録
            </button>
          </div>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500">読み込み中…</p>
        ) : loadError ? (
          <p className="py-8 text-center text-sm text-red-600">{loadError}</p>
        ) : mergedStudents.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            {query.trim()
              ? "検索条件に一致する生徒がいません"
              : "担当生徒がいません。「＋ 新規登録」から追加できます。"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs text-gray-600">
                  <th className="px-3 py-2 font-medium">氏名</th>
                  <th className="px-3 py-2 font-medium">学年</th>
                  <th className="px-3 py-2 font-medium">塾</th>
                  <th className="px-3 py-2 font-medium">校舎</th>
                  <th className="px-3 py-2 font-medium">クラス</th>
                  <th className="px-3 py-2 font-medium">志望校</th>
                  <th className="px-3 py-2 font-medium">担当科目</th>
                </tr>
              </thead>
              <tbody>
                {mergedStudents.map((student) => {
                  const selected = student.id === selectedStudentId;
                  const isUnassigned = student.mySubjects.length === 0;
                  const graduationLabel = formatGraduationYear(student.graduatedAt);
                  return (
                    <tr
                      key={student.id}
                      className={`border-b last:border-b-0 ${selected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="font-medium text-[#1e3a5f] underline-offset-2 hover:underline"
                          onClick={() =>
                            onSelectStudent(student, { tab: "basic" })
                          }
                        >
                          {student.name}
                        </button>
                        {isUnassigned && !student.graduatedAt && (
                          <span className="ml-1.5 text-xs text-amber-700">
                            担当外
                          </span>
                        )}
                        {graduationLabel && (
                          <span className="ml-1.5 text-xs text-gray-500">
                            {graduationLabel}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-800">{student.grade}</td>
                      <td className="px-3 py-2 text-gray-800">
                        {student.cramSchool || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-800">
                        {student.campus || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-800">
                        {student.className || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-800">
                        {student.targetSchool || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {student.mySubjects.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {student.mySubjects.map((subj) => (
                              <button
                                key={subj}
                                type="button"
                                className="rounded bg-[#1e3a5f]/10 px-2 py-0.5 text-xs text-[#1e3a5f] hover:bg-[#1e3a5f]/20"
                                onClick={() =>
                                  onSelectStudent(student, {
                                    tab: "program",
                                    subject: subj,
                                  })
                                }
                              >
                                {subj}
                              </button>
                            ))}
                          </div>
                        ) : student.graduatedAt ? (
                          <span className="text-xs text-gray-400">未割当</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <select
                              className="rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                              value={assignSubject[student.id] ?? SUBJECTS[0]}
                              onChange={(e) =>
                                setAssignSubject((prev) => ({
                                  ...prev,
                                  [student.id]: e.target.value,
                                }))
                              }
                              aria-label="担当する科目"
                            >
                              {SUBJECTS.map((subj) => (
                                <option key={subj} value={subj}>
                                  {subj}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="rounded border border-[#1e3a5f] bg-white px-2 py-0.5 text-xs text-[#1e3a5f] hover:bg-gray-50 disabled:opacity-50"
                              onClick={() =>
                                void handleAssignSelf(
                                  student,
                                  assignSubject[student.id] ?? SUBJECTS[0],
                                )
                              }
                              disabled={assigningId === student.id}
                            >
                              {assigningId === student.id
                                ? "登録中…"
                                : "担当に加わる"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
