"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterTeacherOptions,
  findExactTeacherOption,
  type TeacherOption,
} from "@/lib/teacher-assignment";

type Props = {
  teacherId: string;
  teacherName: string;
  options: TeacherOption[];
  selfTeacherId?: string;
  onChange: (teacherId: string, teacherName: string) => void;
  className?: string;
  placeholder?: string;
};

export function TeacherAssignmentInput({
  teacherId,
  teacherName,
  options,
  selfTeacherId,
  onChange,
  className = "",
  placeholder = "講師名を入力",
}: Props) {
  const [inputValue, setInputValue] = useState(teacherName);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setInputValue(teacherName);
  }, [teacherName, teacherId]);

  const orderedOptions = useMemo(() => {
    if (!selfTeacherId) return options;
    const self = options.find((teacher) => teacher.id === selfTeacherId);
    if (!self) return options;
    return [self, ...options.filter((teacher) => teacher.id !== selfTeacherId)];
  }, [options, selfTeacherId]);

  const candidates = useMemo(
    () => filterTeacherOptions(orderedOptions, inputValue),
    [orderedOptions, inputValue],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [inputValue, candidates.length]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const selectTeacher = (teacher: TeacherOption) => {
    setInputValue(teacher.name);
    onChange(teacher.id, teacher.name);
    setOpen(false);
  };

  const clearTeacher = () => {
    setInputValue("");
    onChange("", "");
    setOpen(false);
  };

  const commitOrRevert = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      clearTeacher();
      return;
    }

    const exact = findExactTeacherOption(options, trimmed);
    if (exact) {
      selectTeacher(exact);
      return;
    }

    // 途中入力のまま blur したら表示を確定済みの講師名に戻す
    setInputValue(teacherName);
  };

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <input
        type="text"
        className={className}
        value={inputValue}
        placeholder={placeholder}
        onChange={(event) => {
          const nextValue = event.target.value;
          setInputValue(nextValue);
          setOpen(true);

          const exact = findExactTeacherOption(options, nextValue);
          if (exact) {
            onChange(exact.id, exact.name);
          }
        }}
        onFocus={() => {
          focusedRef.current = true;
          setOpen(true);
        }}
        onBlur={() => {
          focusedRef.current = false;
          commitOrRevert();
          setOpen(false);
        }}
        onKeyDown={(event) => {
          if (!open || candidates.length === 0) {
            if (event.key === "Escape") setOpen(false);
            return;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) =>
              index + 1 >= candidates.length ? 0 : index + 1,
            );
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) =>
              index - 1 < 0 ? candidates.length - 1 : index - 1,
            );
            return;
          }

          if (event.key === "Enter" && candidates[activeIndex]) {
            event.preventDefault();
            selectTeacher(candidates[activeIndex]);
            return;
          }

          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {open && (candidates.length > 0 || inputValue.trim()) ? (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded border border-gray-300 bg-white shadow-lg">
          {candidates.length > 0 ? (
            candidates.map((teacher, index) => (
              <button
                key={teacher.id}
                type="button"
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                  index === activeIndex ? "bg-blue-50" : ""
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectTeacher(teacher)}
              >
                {teacher.name}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-gray-500">
              該当する講師がいません
            </div>
          )}
          {inputValue.trim() ? (
            <button
              type="button"
              className="block w-full border-t px-3 py-2 text-left text-xs text-gray-500 hover:bg-gray-50"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearTeacher}
            >
              未割当にする
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
