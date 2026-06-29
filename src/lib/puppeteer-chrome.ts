import fs from "fs";
import os from "os";
import path from "path";
import puppeteer from "puppeteer";

function ensurePuppeteerCacheDir(): void {
  if (process.env.PUPPETEER_CACHE_DIR?.trim()) return;
  const cacheDir = path.join(process.cwd(), ".cache", "puppeteer");
  fs.mkdirSync(cacheDir, { recursive: true });
  process.env.PUPPETEER_CACHE_DIR = cacheDir;
}

function resolveSystemChromeCandidates(): string[] {
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const programFilesX86 =
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";

  return [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    path.join(
      programFilesX86,
      "Google",
      "Chrome",
      "Application",
      "chrome.exe",
    ),
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(
      programFilesX86,
      "Microsoft",
      "Edge",
      "Application",
      "msedge.exe",
    ),
  ].filter((value): value is string => Boolean(value?.trim()));
}

/** Puppeteer 用 Chrome の実行ファイルパスを解決する */
export async function resolveChromeExecutable(): Promise<string> {
  ensurePuppeteerCacheDir();

  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  try {
    const bundled = await puppeteer.executablePath();
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch {
    // Puppeteer 同梱 Chrome 未インストール
  }

  for (const candidate of resolveSystemChromeCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(
    "Chrome が見つかりません。Google Chrome をインストールするか、プロジェクトフォルダで「npm install」を実行してください。",
  );
}
