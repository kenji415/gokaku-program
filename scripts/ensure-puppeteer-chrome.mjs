import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(root, ".cache", "puppeteer");
fs.mkdirSync(cacheDir, { recursive: true });

const env = {
  ...process.env,
  PUPPETEER_CACHE_DIR: cacheDir,
};

const result = spawnSync(
  "npx",
  ["puppeteer", "browsers", "install", "chrome"],
  {
    cwd: root,
    env,
    stdio: "inherit",
    shell: true,
  },
);

if (result.status !== 0) {
  console.warn(
    "[ensure-puppeteer-chrome] Puppeteer 用 Chrome の取得に失敗しました。PC に Google Chrome が入っていれば PDF 作成は利用できます。",
  );
}
