import fs from "fs";
import path from "path";

const DB_FILE_NAME = "goukaku.db";

export function resolveDataDir(root = process.cwd()) {
  const configured = process.env.GOUKAKU_DATA_DIR?.trim();
  const dataDir = configured
    ? path.resolve(configured)
    : path.join(root, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function resolveDatabasePath(root = process.cwd()) {
  return path.join(resolveDataDir(root), DB_FILE_NAME);
}

export function loadEnvFiles(root = process.cwd()) {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.join(root, name);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env) || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  }
}
