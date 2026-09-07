"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useAutoSave } from "@/hooks/use-auto-save";
import type {
  GuidancePolicyMemo,
  GuidancePolicySheetData,
} from "@/lib/guidance-policy-types";

type Props = {
  studentId: string;
  subject: string;
  teacherId: string;
  saveFlushRef?: MutableRefObject<(() => Promise<boolean>) | null>;
};

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMemoDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value;
  return `${match[1]}/${Number(match[2])}/${Number(match[3])}`;
}

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  minRows = 4,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 20;
    const minHeight = lineHeight * minRows + 16;
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [value, minRows]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={minRows}
      aria-label={ariaLabel}
      className={`block w-full resize-none overflow-hidden rounded border border-gray-300 px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none focus:border-[#1e3a5f] focus:ring-1 focus:ring-[#1e3a5f] ${className}`}
    />
  );
}

export function GuidancePolicyPanel({
  studentId,
  subject,
  teacherId,
  saveFlushRef,
}: Props) {
  const [sheet, setSheet] = useState<GuidancePolicySheetData | null>(null);
  const [policyText, setPolicyText] = useState("");
  const [memos, setMemos] = useState<GuidancePolicyMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveRevision, setSaveRevision] = useState(0);
  const [draftDate, setDraftDate] = useState(todayIsoDate);
  const [draftBody, setDraftBody] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const loadSeqRef = useRef(0);
  const policyTextRef = useRef(policyText);
  const sheetIdRef = useRef<string | null>(null);

  policyTextRef.current = policyText;
  sheetIdRef.current = sheet?.id ?? null;

  const savePolicy = useCallback(async (): Promise<boolean> => {
    const id = sheetIdRef.current;
    if (!id) return true;
    const res = await fetch(`/api/programs/guidance-policy/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policyText: policyTextRef.current }),
    });
    return res.ok;
  }, []);

  const { flush, statusLabel } = useAutoSave(savePolicy, saveRevision);

  useEffect(() => {
    if (saveFlushRef) {
      saveFlushRef.current = flush;
      return () => {
        saveFlushRef.current = null;
      };
    }
  }, [flush, saveFlushRef]);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++loadSeqRef.current;
    setLoading(true);
    setLoadError("");
    setSheet(null);
    setPolicyText("");
    setMemos([]);
    setDraftDate(todayIsoDate());
    setDraftBody("");
    setAddError("");

    void (async () => {
      try {
        const res = await fetch("/api/programs/guidance-policy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId, subject, teacherId }),
        });
        if (cancelled || requestId !== loadSeqRef.current) return;
        if (!res.ok) {
          setLoadError("指導方針メモの読み込みに失敗しました");
          return;
        }
        const data = (await res.json()) as { sheet: GuidancePolicySheetData };
        setSheet(data.sheet);
        setPolicyText(data.sheet.policyText);
        setMemos(data.sheet.memos);
        setSaveRevision(0);
      } catch {
        if (cancelled || requestId !== loadSeqRef.current) return;
        setLoadError("指導方針メモの読み込みに失敗しました");
      } finally {
        if (!cancelled && requestId === loadSeqRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId, subject, teacherId]);

  const handleAddMemo = async () => {
    if (!sheet || adding) return;
    const body = draftBody.trim();
    if (!body) {
      setAddError("メモ内容を入力してください");
      return;
    }
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch(`/api/programs/guidance-policy/${sheet.id}/memos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoDate: draftDate, body }),
      });
      if (!res.ok) {
        setAddError("メモの追加に失敗しました");
        return;
      }
      const data = (await res.json()) as { memo: GuidancePolicyMemo };
      setMemos((prev) => [data.memo, ...prev]);
      setDraftBody("");
      setDraftDate(todayIsoDate());
    } catch {
      setAddError("メモの追加に失敗しました");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteMemo = async (memoId: string) => {
    if (!sheet) return;
    if (!window.confirm("このメモを削除しますか？")) return;
    const res = await fetch(
      `/api/programs/guidance-policy/${sheet.id}/memos/${memoId}`,
      { method: "DELETE" },
    );
    if (!res.ok) return;
    setMemos((prev) => prev.filter((m) => m.id !== memoId));
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">読み込み中…</div>
    );
  }

  if (loadError || !sheet) {
    return (
      <div className="p-8 text-center text-sm text-red-600">
        {loadError || "表示できません"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-2 py-2">
      <div className="rounded border bg-white p-4 shadow-sm">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">指導方針メモ</h2>
          <p className="text-xs text-gray-500">
            {sheet.student.name}（{sheet.student.grade}）・{sheet.subject}
          </p>
        </div>
        {statusLabel ? (
          <p className="mb-3 text-xs text-gray-500">{statusLabel}</p>
        ) : (
          <div className="mb-3" />
        )}

        <section className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-gray-800">指導方針</h3>
          <p className="mb-2 text-xs text-gray-500">
            方針や方針の根拠などを自由に記録できます。内容が増えると枠が下に伸びます。
          </p>
          <AutoGrowTextarea
            value={policyText}
            onChange={(next) => {
              setPolicyText(next);
              setSaveRevision((n) => n + 1);
            }}
            placeholder="指導方針・注意点・保護者との共有事項など"
            minRows={6}
            ariaLabel="指導方針"
          />
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium text-gray-800">日付メモ</h3>
          <div className="mb-3 flex flex-wrap items-end gap-2 rounded border border-dashed border-gray-300 bg-gray-50 p-3">
            <label className="text-xs text-gray-600">
              日付
              <input
                type="date"
                lang="ja"
                className="mt-1 block rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
              />
            </label>
            <label className="min-w-[12rem] flex-1 text-xs text-gray-600">
              メモ
              <textarea
                className="mt-1 block min-h-[2.5rem] w-full resize-y rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                rows={2}
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="宿題の記録等"
              />
            </label>
            <button
              type="button"
              className="rounded bg-[#1e3a5f] px-3 py-1.5 text-sm text-white hover:bg-[#2a4f7a] disabled:opacity-50"
              disabled={adding}
              onClick={() => void handleAddMemo()}
            >
              追加
            </button>
          </div>
          {addError ? (
            <p className="mb-2 text-xs text-red-600">{addError}</p>
          ) : null}

          {memos.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">
              まだメモはありません
            </p>
          ) : (
            <ul className="space-y-2">
              {memos.map((memo) => (
                <li
                  key={memo.id}
                  className="rounded border border-gray-200 bg-white px-3 py-2"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium tabular-nums text-[#1e3a5f]">
                      {formatMemoDate(memo.memoDate)}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-red-600"
                      onClick={() => void handleDeleteMemo(memo.id)}
                    >
                      削除
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900">
                    {memo.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
