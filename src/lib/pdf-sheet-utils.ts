export function formatPdfExportedAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export function formatUnfilledMonthsError(labels: string[]): string {
  if (labels.length === 0) return "";
  return `${labels.join("・")}未入力`;
}
