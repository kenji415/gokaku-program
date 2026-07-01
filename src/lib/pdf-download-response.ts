export function buildPdfContentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, "_");
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export function pdfDownloadResponse(
  buffer: Buffer,
  fileName: string,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": buildPdfContentDisposition(fileName),
      ...extraHeaders,
    },
  });
}
