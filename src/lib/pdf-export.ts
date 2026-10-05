import fs from "fs";
import path from "path";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { SESSION_COOKIE_NAME } from "./auth-session";
import {
  resolveFinalStretchExportDir,
  resolveProgramSheetExportDir,
  sanitizePdfFilename,
} from "./desktop-path";
import { resolveChromeExecutable } from "./puppeteer-chrome";

/** Puppeteer はサーバー PC 上で動くため、常に loopback を使う（LAN IP だと自 PC から届かず固まる） */
function resolvePdfServerBaseUrl(): string {
  const port = process.env.PORT ?? 3000;
  return `http://127.0.0.1:${port}`;
}

export function resolvePdfBaseUrl(_request?: Request): string {
  return resolvePdfServerBaseUrl();
}

type SharedPdfBrowserState = {
  browser?: Browser;
  launching?: Promise<Browser>;
  shutdownHooked?: boolean;
};

const globalForPdf = globalThis as typeof globalThis & {
  __gokakuSharedPdfBrowser?: SharedPdfBrowserState;
};

function sharedPdfBrowserState(): SharedPdfBrowserState {
  globalForPdf.__gokakuSharedPdfBrowser ??= {};
  return globalForPdf.__gokakuSharedPdfBrowser;
}

function forgetPdfBrowser(browser?: Browser): void {
  const state = sharedPdfBrowserState();
  if (!browser || state.browser === browser) {
    state.browser = undefined;
  }
}

function ensurePdfBrowserShutdownHook(): void {
  const state = sharedPdfBrowserState();
  if (state.shutdownHooked) return;
  state.shutdownHooked = true;
  process.once("exit", () => {
    const browser = state.browser;
    state.browser = undefined;
    try {
      browser?.process()?.kill();
    } catch {
      // プロセス終了中は失敗しても続行する
    }
  });
}

async function launchPdfBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    executablePath: await resolveChromeExecutable(),
    args: [
      "--headless=new",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-sync",
      "--no-first-run",
      "--mute-audio",
    ],
  });
}

/** 起動済みの Chrome を返す。落ちていれば起動し直す。 */
async function acquirePdfBrowser(): Promise<Browser> {
  ensurePdfBrowserShutdownHook();
  const state = sharedPdfBrowserState();
  if (state.browser?.connected) return state.browser;

  if (!state.launching) {
    state.browser = undefined;
    state.launching = launchPdfBrowser()
      .then((browser) => {
        state.browser = browser;
        browser.once("disconnected", () => {
          forgetPdfBrowser(browser);
        });
        return browser;
      })
      .finally(() => {
        state.launching = undefined;
      });
  }

  return state.launching;
}

async function resolvePdfBrowser(existing?: Browser): Promise<Browser> {
  if (existing?.connected) return existing;
  return acquirePdfBrowser();
}

/** 1枚ごとに Cookie を分ける。Chrome 本体は使い回す。 */
async function withIsolatedPdfPage<T>(
  browser: Browser,
  run: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    return await run(page);
  } finally {
    await context.close().catch(() => undefined);
  }
}

/**
 * 印刷 HTML を開くあいだだけ JS を止める。
 * 開発時の hydration 不一致でシート全体を描き直すと、PDF が遅くなる。
 * 開いたあとは evaluate できるよう JS を戻す。読み込み済みの script は再実行されない。
 */
async function gotoPrintPage(
  page: Page,
  url: string,
  waitUntil: "load" | "domcontentloaded",
): Promise<Awaited<ReturnType<Page["goto"]>>> {
  await page.setJavaScriptEnabled(false);
  try {
    return await page.goto(url, { waitUntil, timeout: 60_000 });
  } finally {
    await page.setJavaScriptEnabled(true);
  }
}

async function waitForPrintFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/** Puppeteer の Chrome をバックグラウンドで終了（レスポンス送信をブロックしない） */
export function releasePdfBrowser(browser?: Browser): void {
  if (!browser) return;
  void disposePdfBrowser(browser).catch(() => undefined);
}

/** Puppeteer の Chrome を確実に終了させる */
export async function disposePdfBrowser(browser?: Browser): Promise<void> {
  if (!browser) return;
  forgetPdfBrowser(browser);
  try {
    const pages = await browser.pages();
    await Promise.all(pages.map((page) => page.close().catch(() => undefined)));
    await browser.close();
  } catch {
    try {
      browser.process()?.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
}

const PROGRAM_SHEET_PDF_OPTIONS = {
  printBackground: true,
  width: "257mm",
  height: "182mm",
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
  pageRanges: "1",
} as const;

async function exportViewerSheetToPdfWithBrowser(
  browser: Browser,
  params: {
    sheetId: string;
    sessionToken: string;
    baseUrl: string;
    contentFontSize?: number;
  },
): Promise<Buffer> {
  return withIsolatedPdfPage(browser, async (page) => {
    await page.setCacheEnabled(false);
    await page.setCookie({
      name: SESSION_COOKIE_NAME,
      value: params.sessionToken,
      url: params.baseUrl,
      path: "/",
      httpOnly: true,
    });

    const fontQuery =
      typeof params.contentFontSize === "number" && params.contentFontSize > 0
        ? `?contentFontSize=${encodeURIComponent(String(params.contentFontSize))}`
        : "";
    const response = await gotoPrintPage(
      page,
      `${params.baseUrl}/programs/${params.sheetId}/print${fontQuery}`,
      "load",
    );
    if (!response || !response.ok()) {
      throw new Error(
        `印刷ページの読み込みに失敗しました (${response?.status() ?? "no response"})`,
      );
    }
    await waitForPrintFonts(page);

    // B5横（257×182mm）に合わせ、min-h-screen による2枚目の白紙を防ぐ
    await page.setViewport({ width: 972, height: 688, deviceScaleFactor: 1 });

    await page.emulateMediaType("print");

    await page.waitForSelector(".program-sheet", { timeout: 30_000 });

    // 印刷用ページを1枚分のサイズに固定し、2枚目の白紙を防ぐ
    await page.evaluate(() => {
      const sheet = document.querySelector(".program-sheet");
      if (!sheet) throw new Error("program sheet not found");
      document.body.replaceChildren(sheet);

      for (const element of [document.documentElement, document.body]) {
        const node = element as HTMLElement;
        node.style.margin = "0";
        node.style.padding = "0";
        node.style.width = "257mm";
        node.style.height = "182mm";
        node.style.minHeight = "0";
        node.style.maxHeight = "182mm";
        node.style.overflow = "hidden";
        node.style.background = "white";
      }

      const sheetEl = sheet as HTMLElement;
      sheetEl.style.margin = "0";
      sheetEl.style.pageBreakAfter = "auto";
      sheetEl.style.breakAfter = "auto";
    });

    await page.waitForFunction(
      () => {
        const img = document.querySelector(
          ".program-sheet-footer-logo",
        ) as HTMLImageElement | null;
        return Boolean(img && img.complete && img.naturalWidth > 0);
      },
      { timeout: 15_000 },
    );

    const pdfBuffer = await page.pdf(PROGRAM_SHEET_PDF_OPTIONS);
    return Buffer.from(pdfBuffer);
  });
}

export async function renderProgramSheetPdf(params: {
  sheetId: string;
  filenameBase: string;
  sessionToken: string;
  request?: Request;
  baseUrl?: string;
  browser?: Browser;
  contentFontSize?: number;
}): Promise<{ buffer: Buffer; fileName: string; browser: Browser }> {
  const fileName = `${sanitizePdfFilename(params.filenameBase)}.pdf`;
  const baseUrl = params.baseUrl ?? resolvePdfServerBaseUrl();
  const browser = await resolvePdfBrowser(params.browser);

  try {
    const buffer = await exportViewerSheetToPdfWithBrowser(browser, {
      sheetId: params.sheetId,
      sessionToken: params.sessionToken,
      baseUrl,
      contentFontSize: params.contentFontSize,
    });
    return { buffer, fileName, browser };
  } catch (error) {
    if (!browser.connected) forgetPdfBrowser(browser);
    throw error;
  }
}

export async function writeProgramSheetPdf(params: {
  sheetId: string;
  filenameBase: string;
  sessionToken: string;
  request?: Request;
  baseUrl?: string;
  browser?: Browser;
}): Promise<{ filePath: string; fileName: string; browser: Browser }> {
  const exportDir = resolveProgramSheetExportDir();
  const result = await renderProgramSheetPdf(params);
  const filePath = path.join(exportDir, result.fileName);
  fs.writeFileSync(filePath, result.buffer);
  return { filePath, fileName: result.fileName, browser: result.browser };
}

async function exportFinalStretchSheetToPdfWithBrowser(
  browser: Browser,
  params: {
    sheetId: string;
    sessionToken: string;
    baseUrl: string;
  },
): Promise<Buffer> {
  return withIsolatedPdfPage(browser, async (page) => {
    await page.setCacheEnabled(false);
    await page.setCookie({
      name: SESSION_COOKIE_NAME,
      value: params.sessionToken,
      url: params.baseUrl,
      path: "/",
      httpOnly: true,
    });

    const response = await gotoPrintPage(
      page,
      `${params.baseUrl}/programs/final-stretch/${params.sheetId}/print`,
      "load",
    );
    if (!response || !response.ok()) {
      throw new Error(
        `印刷ページの読み込みに失敗しました (${response?.status() ?? "no response"})`,
      );
    }
    await waitForPrintFonts(page);

    await page.setViewport({ width: 972, height: 688, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    await page.waitForSelector(".final-stretch-sheet", { timeout: 30_000 });

    await page.evaluate(() => {
      const sheet = document.querySelector(".final-stretch-with-editor");
      if (!sheet) throw new Error("final stretch sheet not found");
      document.body.replaceChildren(sheet);

      for (const element of [document.documentElement, document.body]) {
        const node = element as HTMLElement;
        node.style.margin = "0";
        node.style.padding = "0";
        node.style.width = "257mm";
        node.style.height = "182mm";
        node.style.minHeight = "0";
        node.style.maxHeight = "182mm";
        node.style.overflow = "hidden";
        node.style.background = "white";
      }

      const sheetEl = sheet as HTMLElement;
      sheetEl.style.margin = "0";
      sheetEl.style.pageBreakAfter = "auto";
      sheetEl.style.breakAfter = "auto";
    });

    await page.waitForFunction(
      () => {
        const img = document.querySelector(
          ".final-stretch-sheet-footer-logo",
        ) as HTMLImageElement | null;
        return Boolean(img && img.complete && img.naturalWidth > 0);
      },
      { timeout: 15_000 },
    );

    const pdfBuffer = await page.pdf(PROGRAM_SHEET_PDF_OPTIONS);
    return Buffer.from(pdfBuffer);
  });
}

export async function renderFinalStretchSheetPdf(params: {
  sheetId: string;
  filenameBase: string;
  sessionToken: string;
  request?: Request;
  baseUrl?: string;
  browser?: Browser;
}): Promise<{ buffer: Buffer; fileName: string; browser: Browser }> {
  const fileName = `${sanitizePdfFilename(params.filenameBase)}.pdf`;
  const baseUrl = params.baseUrl ?? resolvePdfServerBaseUrl();
  const browser = await resolvePdfBrowser(params.browser);

  try {
    const buffer = await exportFinalStretchSheetToPdfWithBrowser(browser, {
      sheetId: params.sheetId,
      sessionToken: params.sessionToken,
      baseUrl,
    });
    return { buffer, fileName, browser };
  } catch (error) {
    if (!browser.connected) forgetPdfBrowser(browser);
    throw error;
  }
}

export async function writeFinalStretchSheetPdf(params: {
  sheetId: string;
  filenameBase: string;
  sessionToken: string;
  request?: Request;
  baseUrl?: string;
  browser?: Browser;
}): Promise<{ filePath: string; fileName: string; browser: Browser }> {
  const exportDir = resolveFinalStretchExportDir();
  const result = await renderFinalStretchSheetPdf(params);
  const filePath = path.join(exportDir, result.fileName);
  fs.writeFileSync(filePath, result.buffer);
  return { filePath, fileName: result.fileName, browser: result.browser };
}

export async function closePdfBrowser(browser: Browser | undefined): Promise<void> {
  await disposePdfBrowser(browser);
}

const COURSE_PROPOSAL_PDF_OPTIONS = {
  printBackground: true,
  preferCSSPageSize: true,
  width: "176mm",
  height: "250mm",
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
  pageRanges: "1",
} as const;

async function exportCourseProposalSheetToPdfWithBrowser(
  browser: Browser,
  params: {
    sheetId: string;
    sessionToken: string;
    baseUrl: string;
  },
): Promise<Buffer> {
  return withIsolatedPdfPage(browser, async (page) => {
    await page.setCacheEnabled(false);
    await page.setCookie({
      name: SESSION_COOKIE_NAME,
      value: params.sessionToken,
      url: params.baseUrl,
      path: "/",
      httpOnly: true,
    });

    await gotoPrintPage(
      page,
      `${params.baseUrl}/programs/course-proposal/${params.sheetId}/print`,
      "domcontentloaded",
    );

    if (page.url().includes("/login")) {
      throw new Error("印刷ページの認証に失敗しました");
    }
    await waitForPrintFonts(page);

    await page.setViewport({ width: 665, height: 945, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    await page.waitForSelector(".course-proposal-sheet", { timeout: 30_000 });

    await page.evaluate(() => {
      const sheet = document.querySelector(".course-proposal-sheet");
      if (!sheet) throw new Error("course proposal sheet not found");
      document.body.replaceChildren(sheet);

      const pageStyle = document.createElement("style");
      pageStyle.textContent = "@page { size: 176mm 250mm; margin: 0; }";
      document.head.appendChild(pageStyle);

      for (const element of [document.documentElement, document.body]) {
        const node = element as HTMLElement;
        node.style.setProperty("margin", "0", "important");
        node.style.setProperty("padding", "0", "important");
        node.style.setProperty("width", "176mm", "important");
        node.style.setProperty("height", "250mm", "important");
        node.style.setProperty("min-height", "0", "important");
        node.style.setProperty("max-width", "176mm", "important");
        node.style.setProperty("max-height", "250mm", "important");
        node.style.setProperty("overflow", "hidden", "important");
        node.style.setProperty("background", "white", "important");
      }

      const sheetEl = sheet as HTMLElement;
      sheetEl.style.setProperty("width", "176mm", "important");
      sheetEl.style.setProperty("height", "250mm", "important");
      sheetEl.style.setProperty("max-width", "none", "important");
      sheetEl.style.setProperty("margin", "0", "important");
      sheetEl.style.pageBreakAfter = "auto";
      sheetEl.style.breakAfter = "auto";

      for (const advice of document.querySelectorAll(
        ".course-proposal-subject-advice",
      )) {
        const node = advice as HTMLElement;
        node.style.whiteSpace = "pre-wrap";
        node.style.wordBreak = "break-word";
      }
    });

    try {
      await page.waitForFunction(
        () => {
          const img = document.querySelector(
            ".course-proposal-footer-logo",
          ) as HTMLImageElement | null;
          return Boolean(img && img.complete && img.naturalWidth > 0);
        },
        { timeout: 5_000 },
      );
    } catch {
      // ロゴ読み込みが遅い場合でも PDF 生成は続行する
    }

    const pdfBuffer = await page.pdf(COURSE_PROPOSAL_PDF_OPTIONS);
    return Buffer.from(pdfBuffer);
  });
}

export async function renderCourseProposalSheetPdf(params: {
  sheetId: string;
  filenameBase: string;
  sessionToken: string;
  request?: Request;
  baseUrl?: string;
  browser?: Browser;
}): Promise<{ buffer: Buffer; fileName: string; browser: Browser }> {
  const fileName = `${sanitizePdfFilename(params.filenameBase)}.pdf`;
  const baseUrl = params.baseUrl ?? resolvePdfServerBaseUrl();
  const browser = await resolvePdfBrowser(params.browser);

  try {
    const buffer = await exportCourseProposalSheetToPdfWithBrowser(browser, {
      sheetId: params.sheetId,
      sessionToken: params.sessionToken,
      baseUrl,
    });
    return { buffer, fileName, browser };
  } catch (error) {
    if (!browser.connected) forgetPdfBrowser(browser);
    throw error;
  }
}
