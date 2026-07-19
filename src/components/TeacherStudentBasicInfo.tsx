"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { CRAM_SCHOOL_NAMES, GENDERS, GRADES, isFixedSubject } from "@/lib/constants";
import { useTestScheduleCramSchoolNames } from "@/hooks/use-test-schedule-cram-schools";
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
  isAdmin?: boolean;
  isNew?: boolean;
  initialName?: string;
  onSaved?: (info: StudentBasicInfo) => void;
  onExistingStudentFound?: (student: StudentSummary) => void;
  onStudentCreated?: (student: StudentSummary) => void;
  onUnassigned?: () => void;
  onGraduated?: () => void;
  saveFlushRef?: MutableRefObject<(() => Promise<boolean>) | null>;
  refreshKey?: number;
};

const fieldClass =
  "w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm";

function buildPayload(
  info: StudentBasicInfo,
  classNameLocked: boolean,
) {
  return {
    name: normalizeStudentName(info.name),
    gender: info.gender,
    grade: info.grade,
    cramSchool: info.cramSchool,
    campus: info.campus,
    className: info.className,
    ...(classNameLocked ? { classNameLocked: true } : {}),
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
          subject: row.subject.trim(),
          teacherId: resolved.teacherId,
        };
      })
      .filter((row) => row.teacherId && row.subject),
  };
}

export function TeacherStudentBasicInfo({
  studentId,
  teacherId,
  isAdmin = false,
  isNew = false,
  initialName = "",
  onSaved,
  onExistingStudentFound,
  onStudentCreated,
  onUnassigned,
  onGraduated,
  saveFlushRef,
  refreshKey = 0,
}: Props) {
  const [info, setInfo] = useState<StudentBasicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveRevision, setSaveRevision] = useState(0);
  const [savingNew, setSavingNew] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [showUnassignHint, setShowUnassignHint] = useState(false);
  const [showGraduateHint, setShowGraduateHint] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const [graduating, setGraduating] = useState(false);
  const testScheduleCramSchools = useTestScheduleCramSchoolNames();
  const infoRef = useRef<StudentBasicInfo | null>(null);
  const classNameLockedRef = useRef(false);
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
          classNameLockedRef.current = data.classNameLocked;
          setInfo(
            isNew && initialName ? { ...data, name: initialName } : data,
          );
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
  }, [studentId, isNew, refreshKey, initialName]);

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

  const updateClassName = (value: string) => {
    classNameLockedRef.current = true;
    setInfo((prev) =>
      prev ? { ...prev, className: value, classNameLocked: true } : prev,
    );
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

  const updateCustomSubjectName = (index: number, nextSubject: string) => {
    setInfo((prev) => {
      if (!prev) return prev;
      const current = prev.assignments[index];
      if (!current || isFixedSubject(current.subject)) return prev;

      const trimmed = nextSubject.trim();
      const duplicate = prev.assignments.some(
        (row, i) => i !== index && row.subject === trimmed,
      );
      if (trimmed && duplicate) return prev;

      return {
        ...prev,
        assignments: prev.assignments.map((row, i) =>
          i === index ? { ...row, subject: nextSubject } : row,
        ),
      };
    });
  };

  const commitCustomSubjectName = (index: number) => {
    setInfo((prev) => {
      if (!prev) return prev;
      const current = prev.assignments[index];
      if (!current || isFixedSubject(current.subject)) return prev;

      const trimmed = current.subject.trim();
      if (!trimmed) {
        return {
          ...prev,
          assignments: prev.assignments.filter((_, i) => i !== index),
        };
      }

      const duplicate = prev.assignments.some(
        (row, i) => i !== index && row.subject === trimmed,
      );
      if (duplicate) {
        window.alert("同じ科目名が既にあります");
        return prev;
      }

      return {
        ...prev,
        assignments: prev.assignments.map((row, i) =>
          i === index ? { ...row, subject: trimmed } : row,
        ),
      };
    });
    bumpSave();
  };

  const addCustomSubject = () => {
    const trimmed = newSubjectName.trim();
    if (!trimmed) return;
    if (!info) return;
    if (info.assignments.some((row) => row.subject === trimmed)) {
      window.alert("同じ科目名が既にあります");
      return;
    }
    setInfo((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assignments: [
          ...prev.assignments,
          { subject: trimmed, teacherId: "", teacherName: "" },
        ],
      };
    });
    setNewSubjectName("");
  };

  const removeCustomSubject = (index: number) => {
    setInfo((prev) => {
      if (!prev) return prev;
      const current = prev.assignments[index];
      if (!current || isFixedSubject(current.subject)) return prev;
      return {
        ...prev,
        assignments: prev.assignments.filter((_, i) => i !== index),
      };
    });
    bumpSave();
  };

  const persist = useCallback(async (): Promise<boolean> => {
    const current = infoRef.current;
    if (!current) return false;
    if (!current.name.trim()) return true;

    const payload = buildPayload(current, classNameLockedRef.current);
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
      classNameLockedRef.current = saved.classNameLocked;
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
    classNameLockedRef.current = saved.classNameLocked;
    setInfo(saved);
    onSaved?.(saved);
    return true;
  }, [onExistingStudentFound, onSaved, onStudentCreated]);

  const { statusLabel, flush } = useAutoSave(persist, saveRevision, {
    enabled: !isNew,
  });

  useEffect(() => {
    if (!saveFlushRef) return;
    saveFlushRef.current = isNew ? async () => true : flush;
    return () => {
      saveFlushRef.current = null;
    };
  }, [flush, saveFlushRef, isNew]);

  const hasSelfAssignment = info?.assignments.some(
    (row) => row.teacherId === teacherId,
  );
  const hasAnyAssignment = info?.assignments.some((row) => row.teacherId);

  const unassignHintKey = `maker:unassignHintSeen:${teacherId}`;

  useEffect(() => {
    if (isNew || !hasSelfAssignment || info?.graduatedAt) return;
    try {
      if (!window.localStorage.getItem(unassignHintKey)) {
        setShowUnassignHint(true);
      }
    } catch {
      // localStorage 利用不可時は案内を出さない
    }
  }, [isNew, hasSelfAssignment, info?.graduatedAt, unassignHintKey]);

  const dismissUnassignHint = useCallback(() => {
    setShowUnassignHint(false);
    try {
      window.localStorage.setItem(unassignHintKey, "1");
    } catch {
      // 保存できなくても無視
    }
  }, [unassignHintKey]);

  const graduateHintKey = `maker:graduateHintSeen:${teacherId}`;

  useEffect(() => {
    if (isNew || info?.graduatedAt) return;
    try {
      if (!window.localStorage.getItem(graduateHintKey)) {
        setShowGraduateHint(true);
      }
    } catch {
      // localStorage 利用不可時は案内を出さない
    }
  }, [isNew, info?.graduatedAt, graduateHintKey]);

  const dismissGraduateHint = useCallback(() => {
    setShowGraduateHint(false);
    try {
      window.localStorage.setItem(graduateHintKey, "1");
    } catch {
      // 保存できなくても無視
    }
  }, [graduateHintKey]);

  const canRegisterNew =
    Boolean(info?.name.trim()) &&
    (isAdmin ? Boolean(hasAnyAssignment) : Boolean(hasSelfAssignment));

  const handleManualSave = async () => {
    const current = infoRef.current;
    if (!current) return;
    if (!current.name.trim()) {
      setSaveError("氏名を入力してください");
      return;
    }
    if (!canRegisterNew) {
      setSaveError(
        isAdmin
          ? "担当講師を1科目以上設定してください"
          : "自分を担当講師として1科目以上に設定してください",
      );
      return;
    }
    setSaveError("");
    setSavingNew(true);
    try {
      const ok = await persist();
      if (!ok) setSaveError("保存に失敗しました");
    } catch {
      setSaveError("保存に失敗しました");
    } finally {
      setSavingNew(false);
    }
  };

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
          {isNew ? (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button
                type="button"
                className="rounded bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2a4f7a] disabled:opacity-50"
                onClick={() => void handleManualSave()}
                disabled={savingNew || !canRegisterNew}
              >
                {savingNew ? "保存中…" : "保存"}
              </button>
              {saveError ? (
                <span className="text-xs text-red-600">{saveError}</span>
              ) : (
                <span className="text-xs text-gray-500">
                  {isAdmin
                    ? "担当講師を設定すると保存できます"
                    : "自分を担当科目に設定すると保存できます"}
                </span>
              )}
            </div>
          ) : (
            statusLabel && (
              <span className="text-xs text-green-700">{statusLabel}</span>
            )
          )}
        </div>

        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-800">氏名</span>
            <input
              className={fieldClass}
              value={info.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="受験　太郎"
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
                onChange={(e) => updateClassName(e.target.value)}
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
                {testScheduleCramSchools.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                {info.mockExamPattern &&
                !testScheduleCramSchools.includes(info.mockExamPattern) ? (
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
              同一科目は1名のみ。講師名を入力すると候補が表示されます。割当すると講師のメーカーに表示されます。一覧にない科目は下から追加できます。
            </p>
            <div className="grid grid-cols-2 gap-3">
              {info.assignments.map((row, index) => {
                const fixed = isFixedSubject(row.subject);
                return (
                  <div
                    key={fixed ? row.subject : `custom-${index}`}
                    className="flex min-w-0 items-center gap-2 text-sm"
                  >
                    {fixed ? (
                      <span className="w-10 shrink-0">{row.subject}</span>
                    ) : (
                      <input
                        className="w-16 shrink-0 rounded border border-gray-300 bg-white px-1.5 py-2 text-sm"
                        value={row.subject}
                        aria-label="追加科目名"
                        onChange={(e) =>
                          updateCustomSubjectName(index, e.target.value)
                        }
                        onBlur={() => commitCustomSubjectName(index)}
                      />
                    )}
                    <TeacherAssignmentInput
                      teacherId={row.teacherId}
                      teacherName={row.teacherName}
                      options={info.teacherOptions}
                      selfTeacherId={teacherId}
                      className={`${fieldClass} min-w-0 flex-1`}
                      onChange={(nextTeacherId, nextTeacherName) =>
                        updateAssignment(
                          row.subject,
                          nextTeacherId,
                          nextTeacherName,
                        )
                      }
                    />
                    {!fixed ? (
                      <button
                        type="button"
                        className="shrink-0 text-xs text-gray-500 underline hover:text-red-600"
                        onClick={() => removeCustomSubject(index)}
                      >
                        削除
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                className="min-w-[8rem] flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                value={newSubjectName}
                placeholder="追加する科目名"
                onChange={(e) => setNewSubjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSubject();
                  }
                }}
              />
              <button
                type="button"
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                disabled={!newSubjectName.trim()}
                onClick={addCustomSubject}
              >
                科目を追加
              </button>
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
                      <span className="relative inline-block">
                        <button
                          type="button"
                          className="rounded border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                          onClick={() => {
                            dismissUnassignHint();
                            void handleUnassign();
                          }}
                          disabled={unassigning}
                        >
                          {unassigning ? "解除中…" : "担当を解除"}
                        </button>
                        {showUnassignHint && (
                          <div className="absolute bottom-full left-0 z-[60] mb-2 w-72 rounded-lg border border-amber-300 bg-white p-3 text-left text-gray-800 shadow-xl">
                            <div className="absolute -bottom-1.5 left-6 h-3 w-3 rotate-45 border-b border-r border-amber-300 bg-white" />
                            <p className="text-xs leading-relaxed">
                              休会・退会などで担当を外れた場合は、こちらで担当を解除してください。
                            </p>
                            <div className="mt-2 text-right">
                              <button
                                type="button"
                                className="rounded bg-[#1e3a5f] px-3 py-1 text-xs font-medium text-white hover:bg-[#2a4f7a]"
                                onClick={dismissUnassignHint}
                              >
                                OK
                              </button>
                            </div>
                          </div>
                        )}
                      </span>
                      <p className="mt-2 text-xs text-gray-500">
                        自分が担当している科目の割当をすべて外します。
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="relative inline-block">
                      <button
                        type="button"
                        className="rounded border border-gray-400 bg-white px-4 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                        onClick={() => {
                          dismissGraduateHint();
                          void handleGraduate();
                        }}
                        disabled={graduating}
                      >
                        {graduating ? "登録中…" : "卒塾"}
                      </button>
                      {showGraduateHint && (
                        <div className="absolute bottom-full left-0 z-[60] mb-2 w-72 rounded-lg border border-amber-300 bg-white p-3 text-left text-gray-800 shadow-xl">
                          <div className="absolute -bottom-1.5 left-6 h-3 w-3 rotate-45 border-b border-r border-amber-300 bg-white" />
                          <p className="text-xs leading-relaxed">
                            卒塾生はここで「卒塾」をクリックしてください。
                          </p>
                          <div className="mt-2 text-right">
                            <button
                              type="button"
                              className="rounded bg-[#1e3a5f] px-3 py-1 text-xs font-medium text-white hover:bg-[#2a4f7a]"
                              onClick={dismissGraduateHint}
                            >
                              OK
                            </button>
                          </div>
                        </div>
                      )}
                    </span>
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
