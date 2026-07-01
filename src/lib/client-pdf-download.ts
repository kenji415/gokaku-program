"use client";

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) return decodeURIComponent(utf8[1]);
  const ascii = header.match(/filename="([^"]+)"/i);
  if (ascii) return ascii[1];
  return null;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export type PdfSaveResult =
  | { ok: true; fileName: string; pdfExportedAt?: string }
  | { ok: false; error: string };

export async function savePdfFromResponse(
  res: Response,
  fallbackFileName: string,
): Promise<PdfSaveResult> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || contentType.includes("application/json")) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return {
      ok: false,
      error: data.error ?? "PDFの作成に失敗しました",
    };
  }

  const blob = await res.blob();
  const fileName =
    parseContentDispositionFilename(res.headers.get("Content-Disposition")) ??
    fallbackFileName;
  const pdfExportedAt = res.headers.get("X-Pdf-Exported-At") ?? undefined;

  downloadBlob(blob, fileName);
  return { ok: true, fileName, pdfExportedAt };
}
