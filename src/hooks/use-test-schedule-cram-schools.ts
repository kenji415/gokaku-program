"use client";

import { useEffect, useState } from "react";

export function useTestScheduleCramSchoolNames(): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/programs/test-schedule-cram-schools")
      .then((res) =>
        res.ok ? res.json() : Promise.resolve({ cramSchools: [] as string[] }),
      )
      .then((data: { cramSchools?: string[] }) => {
        if (!cancelled) {
          setNames(data.cramSchools ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) setNames([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return names;
}
