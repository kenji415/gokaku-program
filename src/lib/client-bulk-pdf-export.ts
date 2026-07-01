"use client";

export type BulkPdfCreatedItem = {
  studentId: string;
  name: string;
  fileName: string;
  pdfExportedAt: string;
};

export type BulkPdfFailedItem = {
  studentId: string;
  name: string;
  error: string;
};

export type BulkPdfExportResult = {
  ok: boolean;
  created: BulkPdfCreatedItem[];
  failed: BulkPdfFailedItem[];
  savedCount: number;
};

type BulkPdfStreamEvent =
  | { type: "progress"; done?: number; total?: number }
  | {
      type: "pdf";
      studentId: string;
      name: string;
      fileName: string;
      pdfExportedAt: string;
      data: string;
    }
  | {
      type: "result";
      ok?: boolean;
      created?: BulkPdfCreatedItem[];
      failed?: BulkPdfFailedItem[];
    }
  | { type: "error"; error?: string };

function base64ToPdfBlob(base64: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: "application/pdf" });
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function consumeBulkPdfExportStream(
  body: ReadableStream<Uint8Array>,
  options?: {
    onProgress?: (done: number, total: number) => void;
  },
): Promise<BulkPdfExportResult> {
  let savedCount = 0;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let resultData: Extract<BulkPdfStreamEvent, { type: "result" }> | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as BulkPdfStreamEvent;

      if (event.type === "progress") {
        options?.onProgress?.(event.done ?? 0, event.total ?? 0);
        continue;
      }

      if (event.type === "error") {
        throw new Error(event.error ?? "PDFの一括作成に失敗しました");
      }

      if (event.type === "pdf") {
        downloadBlob(base64ToPdfBlob(event.data), event.fileName);
        savedCount += 1;
        continue;
      }

      if (event.type === "result") {
        resultData = event;
      }
    }
  }

  if (buffer.trim()) {
    const event = JSON.parse(buffer) as BulkPdfStreamEvent;
    if (event.type === "error") {
      throw new Error(event.error ?? "PDFの一括作成に失敗しました");
    }
    if (event.type === "result") {
      resultData = event;
    }
  }

  if (!resultData) {
    throw new Error("PDFの一括作成に失敗しました");
  }

  const created = resultData.created ?? [];
  const failed = resultData.failed ?? [];

  return {
    ok: resultData.ok ?? failed.length === 0,
    created,
    failed,
    savedCount,
  };
}

export function formatBulkPdfSaveMessage(result: BulkPdfExportResult): string {
  if (result.created.length === 0) return "";
  return `${result.savedCount}件のPDFをダウンロードフォルダに保存しました`;
}
