"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { CRAM_SCHOOL_NAMES, GENDERS, GRADES } from "@/lib/constants";
import { formatGraduationYear } from "@/lib/graduation";
import { useAutoSave } from "@/hooks/use-auto-save";
import { normalizeStudentName } from "@/lib/student-name";
import { resolveTeacherAssignment } from "@/lib/teacher-assignment";
import { TeacherAssignmentInput } from "@/components/TeacherAssignmentInput";
import type { StudentBasicInfo } from "@/lib/student-basic-info-types";

type StudentSummary = {
  id: string;
  name: string;
  grade: string;
};

type Props = {
  studentId: string;
  teacherId: string;
  isNew?: boolean;
  onSaved?: (info: StudentBasicInfo) => void;
  onExistingStudentFound?: (student: StudentSummary) => void;
  onStudentCreated?: (student: StudentSummary) => void;
  onUnassigned?: () => void;
  onGraduated?: () => void;
  saveFlushRef?: MutableRefObject<(() => Promise<boolean>) | null>;
};

const fieldClass =
  "w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm";

function buildPayload(info: StudentBasicInfo) {
  return {
    name: normalizeStudentName(info.name),
    gender: info.gender,
    grade: info.grade,
    cramSchool: info.cramSchool,
    campus: info.campus,
    className: info.className,
    mockExamPattern: info.mockExamPattern,
    targetSchool: info.targetSchool,
    assignments: info.assignments
      .map((row) => {
        const resolved = resolveTeacherAssignment(
          row.teacherName,
          row.teacherId,
          info.teacherOptions,
        );
        return {
          subject: row.subject,
          teacherId: resolved.teacherId,
        };
      })
      .filter((row) => row.teacherId),
  };
}

export function TeacherStudentBasicInfo({
  studentId,
  teacherId,
  isNew = false,
  onSaved,
  onExistingStudentFound,
  onStudentCreated,
  onUnassigned,
  onGraduated,
  saveFlushRef,
}: Props) {
  const [info, setInfo] = useState<StudentBasicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveRevision, setSaveRevision] = useState(0);
  const [unassigning, setUnassigning] = useState(false);
  const [graduating, setGraduating] = useState(false);
  const infoRef = useRef<StudentBasicInfo | null>(null);
  const savedIdRef = useRef<string | null>(null);
  const skipNameLookupRef = useRef(false);

  useEffect(() => {
    infoRef.current = info;
  }, [info]);

  useEffect(() => {
    savedIdRef.current = isNew ? null : studentId;
  }, [studentId, isNew]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");

    const url = isNew
      ? "/api/programs/students"
      : `/api/programs/students/${studentId}/basic-info`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        return res.json() as Promise<StudentBasicInfo>;
      })
      .then((data) => {
        if (!cancelled) {
          skipNameLookupRef.current = true;
          setInfo(data);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("生徒情報を読み込めませんでした");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId, isNew]);

  useEffect(() => {
    const name = info?.name.trim();
    if (!name) return;
    if (skipNameLookupRef.current) {
      skipNameLookupRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await fetch(
          `/api/programs/students?name=${encodeURIComponent(name)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as StudentSummary | null;
        const currentId = savedIdRef.current || infoRef.current?.id || "";
        if (data?.id && data.id !== currentId) {
          onExistingStudentFound?.(data);
        }
      })();
    }, 400);

    return () => window.clearTimeout(timer);
  }, [info?.name, info?.id, onExistingStudentFound]);

  const bumpSave = () => setSaveRevision((r) => r + 1);

  const updateField = <K extends keyof StudentBasicInfo>(
    field: K,
    value: StudentBasicInfo[K],
  ) => {
    setInfo((prev) => (prev ? { ...prev, [field]: value } : prev));
    bumpSave();
  };

  const updateAssignment = (
    subject: string,
    nextTeacherId: string,
    nextTeacherName: string,
  ) => {
    setInfo((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assignments: prev.assignments.map((row) =>
          row.subject === subject
            ? {
                ...row,
                teacherId: nextTeacherId,
                teacherName: nextTeacherName,
              }
            : row,
        ),
      };
    });
    bumpSave();
  };

  const persist = useCallback(async (): Promise<boolean> => {
    const current = infoRef.current;
    if (!current) return false;
    if (!current.name.trim()) return true;

    const payload = buildPayload(current);
    const targetId = savedIdRef.current;

    if (!targetId) {
      const res = await fetch("/api/programs/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
        const data = (await res.json()) as { student?: StudentSummary };
        if (data.student) onExistingStudentFound?.(data.student);
        return true;
      }
      if (!res.ok) return false;

      const saved = (await res.json()) as StudentBasicInfo;
      savedIdRef.current = saved.id;
      skipNameLookupRef.current = true;
      setInfo(saved);
      onStudentCreated?.({
        id: saved.id,
        name: saved.name,
        grade: saved.grade,
      });
      onSaved?.(saved);
      return true;
    }

    const res = await fetch(
      `/api/programs/students/${targetId}/basic-info`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) return false;

    const saved = (await res.json()) as StudentBasicInfo;
    skipNameLookupRef.current = true;
    setInfo(saved);
    onSaved?.(saved);
    return true;
  }, [onExistingStudentFound, onSaved, onStudentCreated]);

  const { statusLabel, flush } = useAutoSave(persist, saveRevision);

  useEffect(() => {
    if (!saveFlushRef) return;
    saveFlushRef.current = flush;
    return () => {
      saveFlushRef.current = null;
    };
  }, [flush, saveFlushRef]);

  const hasSelfAssignment = info?.assignments.some(
    (row) => row.teacherId === teacherId,
  );

  const handleUnassign = async () => {
    const targetId = savedIdRef.current;
    if (!targetId || !hasSelfAssignment) return;
    if (
      !window.confirm(
        "この生徒の担当から外れます。メーカーの生徒一覧からも消えます。よろしいですか？",
      )
    ) {
      return;
    }

    setUnassigning(true);
    try {
      const res = await fetch(
        `/api/programs/students/${targetId}/unassign`,
        { method: "POST" },
      );
      if (!res.ok) return;
      onUnassigned?.();
    } finally {
      setUnassigning(false);
    }
  };

  const handleGraduate = async () => {
    const targetId = savedIdRef.current;
    if (!targetId || info?.graduatedAt) return;
    if (
      !window.confirm(
        "この生徒を卒塾生として登録します。通常の生徒一覧からは非表示になります（「卒塾生含む」で参照できます）。よろしいですか？",
      )
    ) {
      return;
    }

    setGraduating(true);
    try {
      const res = await fetch(
        `/api/programs/students/${targetId}/graduate`,
        { method: "POST" },
      );
      if (!res.ok) return;
      onGraduated?.();
    } finally {
      setGraduating(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl rounded border bg-white p-8 text-center text-sm text-gray-500">
        読み込み中…
      </div>
    );
  }

  if (loadError || !info) {
    return (
      <div className="mx-auto max-w-3xl rounded border bg-white p-8 text-center text-sm text-red-600">
        {loadError || "生徒情報を表示できません"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isNew ? "新規生徒登録" : "生徒基本情報"}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              氏名・学年・塾・校舎・クラス・テストパターン・志望校・担当講師は講師間で共通です。校舎・クラスは集団塾の通塾情報です（シート右上の受験Dr.校舎とは別）。
            </p>
          </div>
          {statusLabel && (
            <span className="text-xs text-green-700">{statusLabel}</span>
          )}
        </div>

        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-800">氏名</span>
            <input
              className={fieldClass}
              value={info.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="船木　柊"
              autoFocus={isNew}
            />
          </label>

          <div className="grid grid-cols-4 gap-2">
            <label className="block min-w-0 text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-800">
                塾
              </span>
              <input
                list="teacher-cram-school-list"
                className={fieldClass}
                value={info.cramSchool}
                onChange={(e) => updateField("cramSchool", e.target.value)}
                placeholder="SAPIX"
              />
            </label>
            <label className="block min-w-0 text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-800">
                校舎
                <span className="font-normal text-gray-500">（集団塾）</span>
              </span>
              <input
                className={fieldClass}
                value={info.campus}
                onChange={(e) => updateField("campus", e.target.value)}
                placeholder="東京校"
              />
            </label>
            <label className="block min-w-0 text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-800">
                クラス
                <span className="font-normal text-gray-500">（集団塾）</span>
              </span>
              <input
                className={fieldClass}
                value={info.className}
                onChange={(e) => updateField("className", e.target.value)}
                placeholder="S"
              />
            </label>
            <label className="block min-w-0 text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-800">
                テストパターン
              </span>
              <select
                className={fieldClass}
                value={info.mockExamPattern}
                onChange={(e) =>
                  updateField("mockExamPattern", e.target.value)
                }
              >
                <option value="">—</option>
                {CRAM_SCHOOL_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                {info.mockExamPattern &&
                !CRAM_SCHOOL_NAMES.includes(
                  info.mockExamPattern as (typeof CRAM_SCHOOL_NAMES)[number],
                ) ? (
                  <option value={info.mockExamPattern}>
                    {info.mockExamPattern}
                  </option>
                ) : null}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <label className="col-span-1 block min-w-0 text-sm">
              <span className="mb-1 block font-medium text-gray-800">性別</span>
              <select
                className={fieldClass}
                value={info.gender ?? ""}
                onChange={(e) =>
                  updateField("gender", e.target.value || null)
                }
              >
                <option value="">—</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>

            <label className="col-span-1 block min-w-0 text-sm">
              <span className="mb-1 block font-medium text-gray-800">学年</span>
              <select
                className={fieldClass}
                value={info.grade}
                onChange={(e) => updateField("grade", e.target.value)}
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>

            <label className="col-span-2 block min-w-0 text-sm">
              <span className="mb-1 block font-medium text-gray-800">志望校</span>
              <input
                className={fieldClass}
                value={info.targetSchool}
                onChange={(e) => updateField("targetSchool", e.target.value)}
                placeholder="志望校を入力"
              />
            </label>
          </div>

          <fieldset className="rounded border border-gray-200 p-4">
            <legend className="px-2 text-sm font-medium text-gray-800">
              科目別担当講師
            </legend>
            <p className="mb-3 text-xs text-gray-500">
              同一科目は1名のみ。講師名を入力すると候補が表示されます。割当すると講師のメーカーに表示されます。
            </p>
            <div className="grid grid-cols-2 gap-3">
              {info.assignments.map((row) => (
                <div
                  key={row.subject}
                  className="flex min-w-0 items-center gap-2 text-sm"
                >
                  <span className="w-10 shrink-0">{row.subject}</span>
                  <TeacherAssignmentInput
                    teacherId={row.teacherId}
                    teacherName={row.teacherName}
                    options={info.teacherOptions}
                    className={`${fieldClass} min-w-0 flex-1`}
                    onChange={(teacherId, teacherName) =>
                      updateAssignment(row.subject, teacherId, teacherName)
                    }
                  />
                </div>
              ))}
            </div>
          </fieldset>

          {!isNew && (
            <div className="space-y-4 border-t border-gray-200 pt-4">
              {info.graduatedAt ? (
                <p className="text-sm text-gray-600">
                  卒塾済み
                  {formatGraduationYear(info.graduatedAt)
                    ? `（${formatGraduationYear(info.graduatedAt)}）`
                    : ""}
                </p>
              ) : (
                <>
                  {hasSelfAssignment && (
                    <div>
                      <button
                        type="button"
                        className="rounded border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                        onClick={() => void handleUnassign()}
                        disabled={unassigning}
                      >
                        {unassigning ? "解除中…" : "担当を解除"}
                      </button>
                      <p className="mt-2 text-xs text-gray-500">
                        自分が担当している科目の割当をすべて外します。
                      </p>
                    </div>
                  )}
                  <div>
                    <button
                      type="button"
                      className="rounded border border-gray-400 bg-white px-4 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                      onClick={() => void handleGraduate()}
                      disabled={graduating}
                    >
                      {graduating ? "登録中…" : "卒塾"}
                    </button>
                    <p className="mt-2 text-xs text-gray-500">
                      塾を卒業した生徒としてアーカイブします。担当解除とは別の操作です。
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <datalist id="teacher-cram-school-list">
        {CRAM_SCHOOL_NAMES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  );
}
