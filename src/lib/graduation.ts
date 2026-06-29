export function formatGraduationYear(graduatedAt: string | null): string | null {
  if (!graduatedAt) return null;
  const parsed = Date.parse(graduatedAt);
  if (Number.isNaN(parsed)) return null;
  return `${new Date(parsed).getFullYear()}年卒`;
}

export function matchesStudentPickerQuery(
  name: string,
  grade: string,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${name} ${grade}`.toLowerCase().includes(q);
}
