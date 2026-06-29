import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { BulkPdfExportParams } from "@/lib/bulk-pdf-export";
import { runBulkPdfExport } from "@/lib/bulk-pdf-export";
import { releaseRuntimeMemory } from "@/lib/runtime-memory";

function resolveTsxCli(): string {
  const candidates = [
    path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(
      process.cwd(),
      "node_modules",
      "drizzle-orm",
      "node_modules",
      "tsx",
      "dist",
      "cli.mjs",
    ),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("tsx が見つかりません。npm install を実行してください。");
}

function spawnBulkPdfWorker(
  params: BulkPdfExportParams,
): ChildProcess {
  const workerPath = path.join(process.cwd(), "scripts", "bulk-pdf-worker.ts");
  const tsxCli = resolveTsxCli();
  return spawn(process.execPath, [tsxCli, workerPath], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? "development",
    },
  });
}

/** 別プロセスで一括 PDF を実行し、完了後に Chrome 等のメモリを親から切り離す */
export function createBulkPdfChildProcessStream(
  params: BulkPdfExportParams,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      let child: ChildProcess;
      try {
        child = spawnBulkPdfWorker(params);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "PDFワーカーの起動に失敗しました";
        controller.enqueue(
          new TextEncoder().encode(`${JSON.stringify({ type: "error", error: message })}\n`),
        );
        controller.close();
        return;
      }

      let closed = false;
      const finish = () => {
        if (closed) return;
        closed = true;
        releaseRuntimeMemory();
        controller.close();
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        console.error(`[bulk-pdf-worker] ${chunk.toString("utf8")}`);
      });

      child.on("error", (error) => {
        controller.enqueue(
          new TextEncoder().encode(
            `${JSON.stringify({
              type: "error",
              error: error.message,
            })}\n`,
          ),
        );
        finish();
      });

      child.on("close", () => {
        finish();
      });

      child.stdin?.write(JSON.stringify(params), "utf8");
      child.stdin?.end();
    },
  });
}

/** 子プロセス起動に失敗した場合のフォールバック */
export function createBulkPdfInlineStream(
  params: BulkPdfExportParams,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (payload: object) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        await runBulkPdfExport(params, emit);
      } catch (error) {
        emit({
          type: "error",
          error:
            error instanceof Error
              ? error.message
              : "PDFの一括作成に失敗しました",
        });
      } finally {
        releaseRuntimeMemory();
        controller.close();
      }
    },
  });
}

export function createBulkPdfExportStream(
  params: BulkPdfExportParams,
): ReadableStream<Uint8Array> {
  if (process.env.BULK_PDF_INLINE === "1") {
    return createBulkPdfInlineStream(params);
  }

  try {
    resolveTsxCli();
    return createBulkPdfChildProcessStream(params);
  } catch {
    return createBulkPdfInlineStream(params);
  }
}
