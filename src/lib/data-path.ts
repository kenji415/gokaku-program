import fs from "fs";
import path from "path";

const DB_FILE_NAME = "goukaku.db";

/** 環境変数 GOUKAKU_DATA_DIR で上書き可能。未設定時はプロジェクト直下の data/ */
export function resolveDataDir(): string {
  const configured = process.env.GOUKAKU_DATA_DIR?.trim();
  const dataDir = configured
    ? path.resolve(configured)
    : path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function resolveDatabasePath(): string {
  return path.join(resolveDataDir(), DB_FILE_NAME);
}

/** ネットワークドライブ等で DB を置くときは GOUKAKU_DB_NETWORK=1 を推奨 */
export function useNetworkDatabaseSettings(): boolean {
  return process.env.GOUKAKU_DB_NETWORK?.trim() === "1";
}
