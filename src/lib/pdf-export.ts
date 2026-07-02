import fs from "fs";
import path from "path";
import puppeteer, { type Browser } from "puppeteer";
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

/** Puppeteer の Chrome をバックグラウンドで終了（レスポンス送信をブロックしない） */
export function releasePdfBrowser(browser?: Browser): void {
  if (!browser) return;
  void disposePdfBrowser(browser).catch(() => undefined);
}

/** Puppeteer の Chrome を確実に終了させる */
export async function disposePdfBrowser(browser?: Browser): Promise<void> {
  if (!browser) return;
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
  },
): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setCacheEnabled(false);
    await page.setCookie({
      name: SESSION_COOKIE_NAME,
      value: params.sessionToken,
      url: params.baseUrl,
      path: "/",
      httpOnly: true,
    });

    await page.goto(`${params.baseUrl}/programs/${params.sheetId}/print`, {
      waitUntil: "load",
      timeout: 120_000,
    });

    // B5横（257×182mm）に合わせ、min-h-screen による2枚目の白紙を防ぐ
    await page.setViewport({ width: 972, height: 688, deviceScaleFactor: 1 });

    await page.emulateMediaType("print");

    await page.waitForSelector(".program-sheet", { timeout: 120_000 });

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
  } finally {
    await page.close();
  }
}

export async function renderProgramSheetPdf(params: {
  sheetId: string;
  filenameBase: string;
  sessionToken: string;
  request?: Request;
  baseUrl?: string;
  browser?: Browser;
}): Promise<{ buffer: Buffer; fileName: string; browser: Browser }> {
  const fileName = `${sanitizePdfFilename(params.filenameBase)}.pdf`;
  const baseUrl = params.baseUrl ?? resolvePdfServerBaseUrl();
  const browser = params.browser ?? (await launchPdfBrowser());
  const ownsBrowser = !params.browser;

  try {
    const buffer = await exportViewerSheetToPdfWithBrowser(browser, {
      sheetId: params.sheetId,
      sessionToken: params.sessionToken,
      baseUrl,
    });
    return { buffer, fileName, browser };
  } catch (error) {
    if (ownsBrowser) await disposePdfBrowser(browser);
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
  const page = await browser.newPage();
  try {
    await page.setCacheEnabled(false);
    await page.setCookie({
      name: SESSION_COOKIE_NAME,
      value: params.sessionToken,
      url: params.baseUrl,
      path: "/",
      httpOnly: true,
    });

    await page.goto(
      `${params.baseUrl}/programs/final-stretch/${params.sheetId}/print`,
      {
        waitUntil: "load",
        timeout: 120_000,
      },
    );

    await page.setViewport({ width: 972, height: 688, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    await page.waitForSelector(".final-stretch-sheet", { timeout: 120_000 });

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
  } finally {
    await page.close();
  }
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
  const browser = params.browser ?? (await launchPdfBrowser());
  const ownsBrowser = !params.browser;

  try {
    const buffer = await exportFinalStretchSheetToPdfWithBrowser(browser, {
      sheetId: params.sheetId,
      sessionToken: params.sessionToken,
      baseUrl,
    });
    return { buffer, fileName, browser };
  } catch (error) {
    if (ownsBrowser) await disposePdfBrowser(browser);
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
  const page = await browser.newPage();
  try {
    await page.setCacheEnabled(false);
    await page.setCookie({
      name: SESSION_COOKIE_NAME,
      value: params.sessionToken,
      url: params.baseUrl,
      path: "/",
      httpOnly: true,
    });

    await page.goto(
      `${params.baseUrl}/programs/course-proposal/${params.sheetId}/print`,
      {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      },
    );

    if (page.url().includes("/login")) {
      throw new Error("印刷ページの認証に失敗しました");
    }

    await page.setViewport({ width: 665, height: 945, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    await page.waitForSelector(".course-proposal-sheet", { timeout: 30_000 });

    await page.evaluate(() => {
      const sheet = document.querySelector(".course-proposal-sheet");
      if (!sheet) throw new Error("course proposal sheet not found");
      document.body.replaceChildren(sheet);

      for (const element of [document.documentElement, document.body]) {
        const node = element as HTMLElement;
        node.style.margin = "0";
        node.style.padding = "0";
        node.style.width = "176mm";
        node.style.height = "250mm";
        node.style.minHeight = "0";
        node.style.maxHeight = "250mm";
        node.style.overflow = "hidden";
        node.style.background = "white";
      }

      const sheetEl = sheet as HTMLElement;
      sheetEl.style.margin = "0";
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
  } finally {
    await page.close();
  }
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
  const browser = params.browser ?? (await launchPdfBrowser());
  const ownsBrowser = !params.browser;

  try {
    const buffer = await exportCourseProposalSheetToPdfWithBrowser(browser, {
      sheetId: params.sheetId,
      sessionToken: params.sessionToken,
      baseUrl,
    });
    return { buffer, fileName, browser };
  } catch (error) {
    if (ownsBrowser) await disposePdfBrowser(browser);
    throw error;
  }
}
