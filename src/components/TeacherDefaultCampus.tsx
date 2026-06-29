"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAutoSave } from "@/hooks/use-auto-save";
import { EXAM_DR_CAMPUS_NAMES } from "@/lib/constants";

type TeacherDefaultCampusContextValue = {
  defaultCampus: string;
  setDefaultCampus: (value: string) => void;
};

const TeacherDefaultCampusContext =
  createContext<TeacherDefaultCampusContextValue | null>(null);

export function TeacherDefaultCampusProvider({
  initialDefaultCampus,
  children,
}: {
  initialDefaultCampus: string;
  children: ReactNode;
}) {
  const [defaultCampus, setDefaultCampus] = useState(initialDefaultCampus);

  useEffect(() => {
    setDefaultCampus(initialDefaultCampus);
  }, [initialDefaultCampus]);

  return (
    <TeacherDefaultCampusContext.Provider
      value={{ defaultCampus, setDefaultCampus }}
    >
      {children}
    </TeacherDefaultCampusContext.Provider>
  );
}

export function useTeacherDefaultCampus() {
  const ctx = useContext(TeacherDefaultCampusContext);
  return (
    ctx ?? {
      defaultCampus: "",
      setDefaultCampus: () => {},
    }
  );
}

export function TeacherDefaultCampusField() {
  const { defaultCampus, setDefaultCampus } = useTeacherDefaultCampus();
  const [value, setValue] = useState(defaultCampus);
  const [saveRevision, setSaveRevision] = useState(0);
  const valueRef = useRef(value);

  useEffect(() => {
    setValue(defaultCampus);
  }, [defaultCampus]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const persist = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultCampus: valueRef.current }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { defaultCampus?: string };
    const saved = data.defaultCampus ?? valueRef.current;
    setDefaultCampus(saved);
    return true;
  }, [setDefaultCampus]);

  const { statusLabel } = useAutoSave(persist, saveRevision);

  return (
    <label className="flex items-center gap-1.5 text-sm text-white/80">
      <span className="shrink-0">基本校舎</span>
      <select
        className="w-32 rounded border border-white/30 bg-white/10 px-2 py-0.5 text-sm text-white"
        value={value}
        aria-label="基本校舎"
        onChange={(e) => {
          setValue(e.target.value);
          setSaveRevision((r) => r + 1);
        }}
      >
        <option value="" className="text-gray-900">
          校舎を選択
        </option>
        {EXAM_DR_CAMPUS_NAMES.map((campus) => (
          <option key={campus} value={campus} className="text-gray-900">
            {campus}
          </option>
        ))}
        {value &&
          !EXAM_DR_CAMPUS_NAMES.includes(
            value as (typeof EXAM_DR_CAMPUS_NAMES)[number],
          ) && (
            <option value={value} className="text-gray-900">
              {value}
            </option>
          )}
      </select>
      {statusLabel && (
        <span className="text-xs text-white/60">{statusLabel}</span>
      )}
    </label>
  );
}
