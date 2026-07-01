import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFiles } from "./data-path.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFiles(root);
const cacheDir = path.join(root, ".cache", "puppeteer");
fs.mkdirSync(cacheDir, { recursive: true });

const child = spawn(
  process.execPath,
  [
    "--expose-gc",
    path.join(root, "node_modules", "next", "dist", "bin", "next"),
    "dev",
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: cacheDir,
    },
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
