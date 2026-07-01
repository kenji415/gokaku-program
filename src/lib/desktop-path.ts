import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const EXPORT_FOLDER_NAME = "合格プログラムシート";
const FINAL_STRETCH_EXPORT_FOLDER_NAME = "直前期合格プログラムシート";

function resolveWindowsShellDesktopPath(): string | null {
  if (process.platform !== "win32") return null;
  try {
    const resolved = execSync(
      'powershell -NoProfile -Command "[Environment]::GetFolderPath(\"Desktop\")"',
      { encoding: "utf8" },
    ).trim();
    if (resolved && fs.existsSync(resolved)) return resolved;
  } catch {
    // ignore
  }
  return null;
}

function desktopCandidates(): string[] {
  const home = os.homedir();
  const shellDesktop = resolveWindowsShellDesktopPath();
  const candidates = [
    shellDesktop,
    path.join(home, "OneDrive", "デスクトップ"),
    path.join(home, "OneDrive", "Desktop"),
    path.join(home, "デスクトップ"),
    path.join(home, "Desktop"),
  ];
  return [...new Set(candidates.filter((value): value is string => Boolean(value)))];
}

export function resolveDesktopPath(): string {
  for (const candidate of desktopCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(os.homedir(), "Desktop");
}

export function resolveProgramSheetExportDir(): string {
  const dir = path.join(resolveDesktopPath(), EXPORT_FOLDER_NAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveFinalStretchExportDir(): string {
  const dir = path.join(resolveDesktopPath(), FINAL_STRETCH_EXPORT_FOLDER_NAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function sanitizePdfFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
}
