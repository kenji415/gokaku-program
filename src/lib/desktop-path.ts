import fs from "fs";
import os from "os";
import path from "path";

const EXPORT_FOLDER_NAME = "合格プログラムシート";
const FINAL_STRETCH_EXPORT_FOLDER_NAME = "直前期合格プログラムシート";

function desktopCandidates(): string[] {
  const home = os.homedir();
  return [
    path.join(home, "Desktop"),
    path.join(home, "OneDrive", "Desktop"),
    path.join(home, "デスクトップ"),
    path.join(home, "OneDrive", "デスクトップ"),
  ];
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
