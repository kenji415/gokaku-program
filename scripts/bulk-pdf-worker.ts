import { runBulkPdfExport, type BulkPdfExportParams } from "../src/lib/bulk-pdf-export";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = await readStdin();
  const params = JSON.parse(raw) as BulkPdfExportParams;

  await runBulkPdfExport(params, (event) => {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  });
}

main().catch((error) => {
  process.stdout.write(
    `${JSON.stringify({
      type: "error",
      error:
        error instanceof Error ? error.message : "PDFの一括作成に失敗しました",
    })}\n`,
  );
  process.exitCode = 1;
});
