import { studentNameMatchesQuery } from "./student-name";

export function matchesNameQuery(name: string, query: string): boolean {
  if (!query.trim()) return true;
  return studentNameMatchesQuery(name, query);
}

export function filterNameOptions(
  options: string[],
  query: string,
  limit = 8,
): string[] {
  const unique = [...new Set(options.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ja"),
  );
  const trimmed = query.trim();
  if (!trimmed) return unique.slice(0, limit);
  return unique
    .filter((name) => studentNameMatchesQuery(name, trimmed))
    .slice(0, limit);
}
