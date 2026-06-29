/** 開発時など、明示的に GC を走らせてメモリを戻す */
export function releaseRuntimeMemory(): void {
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
}
