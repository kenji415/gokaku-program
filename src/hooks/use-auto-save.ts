"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveState = "idle" | "waiting" | "saving" | "saved" | "error";

type Options = {
  enabled?: boolean;
  delayMs?: number;
  skipInitial?: boolean;
};

export function autoSaveStatusLabel(state: AutoSaveState): string {
  switch (state) {
    case "waiting":
      return "変更を検知…";
    case "saving":
      return "自動保存中…";
    case "saved":
      return "自動保存しました";
    case "error":
      return "自動保存に失敗しました";
    default:
      return "";
  }
}

export function useAutoSave(
  saveFn: () => Promise<boolean>,
  trigger: number,
  options: Options = {},
) {
  const { enabled = true, delayMs = 800, skipInitial = true } = options;
  const [state, setState] = useState<AutoSaveState>("idle");
  const saveFnRef = useRef(saveFn);
  const pendingFlushRef = useRef<Promise<boolean> | null>(null);
  const skipRef = useRef(skipInitial);

  saveFnRef.current = saveFn;

  const flush = useCallback(async (): Promise<boolean> => {
    if (pendingFlushRef.current) {
      return pendingFlushRef.current;
    }

    const pending = (async () => {
      setState("saving");
      try {
        const ok = await saveFnRef.current();
        setState(ok ? "saved" : "error");
        return ok;
      } catch {
        setState("error");
        return false;
      } finally {
        pendingFlushRef.current = null;
      }
    })();

    pendingFlushRef.current = pending;
    return pending;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    if (trigger === 0) return;

    setState("waiting");
    const timer = window.setTimeout(() => {
      void flush();
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [trigger, enabled, delayMs, flush]);

  return { state, flush, statusLabel: autoSaveStatusLabel(state) };
}
