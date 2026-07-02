import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { BulkCourseProposalPdfExportParams } from "@/lib/bulk-course-proposal-pdf-export";
import { runBulkCourseProposalPdfExport } from "@/lib/bulk-course-proposal-pdf-export";
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

function spawnBulkCourseProposalPdfWorker(
  params: BulkCourseProposalPdfExportParams,
): ChildProcess {
  const workerPath = path.join(
    process.cwd(),
    "scripts",
    "bulk-course-proposal-pdf-worker.ts",
  );
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

export function createBulkCourseProposalPdfChildProcessStream(
  params: BulkCourseProposalPdfExportParams,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      let child: ChildProcess;
      try {
        child = spawnBulkCourseProposalPdfWorker(params);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "PDFワーカーの起動に失敗しました";
        controller.enqueue(
          new TextEncoder().encode(
            `${JSON.stringify({ type: "error", error: message })}\n`,
          ),
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
        console.error(`[bulk-course-proposal-pdf-worker] ${chunk.toString("utf8")}`);
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

export function createBulkCourseProposalPdfInlineStream(
  params: BulkCourseProposalPdfExportParams,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (payload: object) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        await runBulkCourseProposalPdfExport(params, emit);
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

export function createBulkCourseProposalPdfExportStream(
  params: BulkCourseProposalPdfExportParams,
): ReadableStream<Uint8Array> {
  if (process.env.BULK_PDF_INLINE === "1") {
    return createBulkCourseProposalPdfInlineStream(params);
  }

  try {
    resolveTsxCli();
    return createBulkCourseProposalPdfChildProcessStream(params);
  } catch {
    return createBulkCourseProposalPdfInlineStream(params);
  }
}
