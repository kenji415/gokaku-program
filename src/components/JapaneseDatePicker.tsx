"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalizeDateInput } from "@/lib/test-schedule-utils";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const POPOVER_WIDTH = 216;
const POPOVER_EST_HEIGHT = 220;

function parseParts(value: string): {
  year: number;
  month: number;
  day: number | null;
} | null {
  const normalized = normalizeDateInput(value);
  const match = normalized.match(/^(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: match[3] ? Number(match[3]) : null,
  };
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}/${month}/${day}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

type JapaneseDatePickerProps = {
  value: string;
  onChange: (next: string) => void;
  /** 初期表示月（例: 2026-08）。値がないときに使う */
  defaultYearMonth?: string;
  className?: string;
};

export function JapaneseDatePicker({
  value,
  onChange,
  defaultYearMonth,
  className = "",
}: JapaneseDatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const selected = useMemo(() => parseParts(value), [value]);

  const initialView = useMemo(() => {
    if (selected) return { year: selected.year, month: selected.month };
    const ym = defaultYearMonth?.match(/^(\d{4})-(\d{2})$/);
    if (ym) return { year: Number(ym[1]), month: Number(ym[2]) };
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }, [selected, defaultYearMonth]);

  const [viewYear, setViewYear] = useState(initialView.year);
  const [viewMonth, setViewMonth] = useState(initialView.month);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setViewYear(initialView.year);
    setViewMonth(initialView.month);
  }, [open, initialView.year, initialView.month]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }

    const update = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const openUp = spaceBelow < POPOVER_EST_HEIGHT && rect.top > spaceBelow;
      const top = openUp
        ? Math.max(8, rect.top - POPOVER_EST_HEIGHT - 4)
        : Math.min(rect.bottom + 4, window.innerHeight - POPOVER_EST_HEIGHT - 8);
      const left = Math.min(
        Math.max(8, rect.left),
        window.innerWidth - POPOVER_WIDTH - 8,
      );
      setPos({ top, left });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const shiftMonth = (delta: number) => {
    let y = viewYear;
    let m = viewMonth + delta;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  };

  const firstWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const label =
    selected?.day != null
      ? `${selected.year}/${selected.month}/${selected.day}`
      : "日付選択";

  const popover =
    open && mounted && pos
      ? createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: POPOVER_WIDTH,
              zIndex: 2000,
            }}
            className="rounded border border-gray-300 bg-white p-2 shadow-lg"
            role="dialog"
            aria-label="日付カレンダー"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between gap-1">
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100"
                onClick={() => shiftMonth(-1)}
                aria-label="前月"
              >
                ◀
              </button>
              <div className="text-[11px] font-medium tabular-nums text-gray-900">
                {viewYear}年{viewMonth}月
              </div>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100"
                onClick={() => shiftMonth(1)}
                aria-label="翌月"
              >
                ▶
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-gray-500">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className={
                    day === "日"
                      ? "text-red-500"
                      : day === "土"
                        ? "text-blue-600"
                        : ""
                  }
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="mt-0.5 grid grid-cols-7 gap-0.5 text-center">
              {cells.map((day, index) => {
                if (day == null) {
                  return <div key={`e-${index}`} className="h-6" />;
                }
                const isSelected =
                  selected?.day === day &&
                  selected.year === viewYear &&
                  selected.month === viewMonth;
                const weekday = (firstWeekday + day - 1) % 7;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`h-6 rounded text-[10px] tabular-nums ${
                      isSelected
                        ? "bg-[#1e3a5f] text-white"
                        : weekday === 0
                          ? "text-red-600 hover:bg-gray-100"
                          : weekday === 6
                            ? "text-blue-700 hover:bg-gray-100"
                            : "text-gray-900 hover:bg-gray-100"
                    }`}
                    onClick={() => {
                      onChange(formatDate(viewYear, viewMonth, day));
                      setOpen(false);
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between border-t border-gray-100 pt-1">
              <button
                type="button"
                className="text-[10px] text-gray-500 underline"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                クリア
              </button>
              <button
                type="button"
                className="text-[10px] text-gray-500 underline"
                onClick={() => setOpen(false)}
              >
                閉じる
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={`relative min-w-0 flex-1 ${className}`}>
      <button
        type="button"
        className="month-box-test-field month-box-test-date flex w-full items-center justify-between gap-1 border border-gray-300 text-left"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className={selected?.day != null ? "text-gray-900" : "text-gray-400"}>
          {label}
        </span>
        <span aria-hidden className="text-[11px] text-gray-500">
          ▾
        </span>
      </button>
      {popover}
    </div>
  );
}
