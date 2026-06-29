"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { filterNameOptions } from "@/lib/name-search";

type Props = {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
};

export function NameSearchInput({
  value,
  options,
  onChange,
  label,
  placeholder = "",
  className = "",
}: Props) {
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const candidates = useMemo(
    () => filterNameOptions(options, inputValue),
    [options, inputValue],
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

  const selectOption = (name: string) => {
    setInputValue(name);
    onChange(name);
    setOpen(false);
  };

  return (
    <label className="block min-w-[10rem] flex-1 text-sm">
      <span className="mb-1 block text-xs font-medium text-gray-700">{label}</span>
      <div ref={containerRef} className="relative">
        <input
          type="text"
          className={`w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm ${className}`}
          value={inputValue}
          placeholder={placeholder}
          onChange={(event) => {
            const nextValue = event.target.value;
            setInputValue(nextValue);
            onChange(nextValue);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (!open || candidates.length === 0) return;

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
              selectOption(candidates[activeIndex]);
              return;
            }

            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />

        {open && candidates.length > 0 ? (
          <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded border border-gray-300 bg-white shadow-lg">
            {candidates.map((name, index) => (
              <button
                key={name}
                type="button"
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                  index === activeIndex ? "bg-blue-50" : ""
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(name)}
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}
