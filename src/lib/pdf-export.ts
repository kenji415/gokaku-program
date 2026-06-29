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

function resolveBaseUrl(request: Request): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const origin = request.headers.get("origin");
  if (origin) return origin;

  const host = request.headers.get("host");
  if (host) return `http://${host}`;

  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function resolvePdfBaseUrl(request: Request): string {
  return resolveBaseUrl(request);
}

async function launchPdfBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    executablePath: await resolveChromeExecutable(),
    args: [
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

async function exportViewerSheetToPdfWithBrowser(
  browser: Browser,
  params: {
    sheetId: string;
    sessionToken: string;
    outputPath: string;
    baseUrl: string;
  },
): Promise<void> {
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

    await page.pdf({
      path: params.outputPath,
      printBackground: true,
      width: "257mm",
      height: "182mm",
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      pageRanges: "1",
    });
  } finally {
    await page.close();
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
  const fileName = `${sanitizePdfFilename(params.filenameBase)}.pdf`;
  const filePath = path.join(exportDir, fileName);
  const baseUrl =
    params.baseUrl ??
    (params.request
      ? resolveBaseUrl(params.request)
      : `http://localhost:${process.env.PORT ?? 3000}`);
  const browser = params.browser ?? (await launchPdfBrowser());
  const ownsBrowser = !params.browser;

  try {
    await exportViewerSheetToPdfWithBrowser(browser, {
      sheetId: params.sheetId,
      sessionToken: params.sessionToken,
      outputPath: filePath,
      baseUrl,
    });
  } catch (error) {
    if (ownsBrowser) await disposePdfBrowser(browser);
    throw error;
  }

  if (!fs.existsSync(filePath)) {
    if (ownsBrowser) await disposePdfBrowser(browser);
    throw new Error("PDF file was not created");
  }

  return { filePath, fileName, browser };
}

async function exportFinalStretchSheetToPdfWithBrowser(
  browser: Browser,
  params: {
    sheetId: string;
    sessionToken: string;
    outputPath: string;
    baseUrl: string;
  },
): Promise<void> {
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

    await page.pdf({
      path: params.outputPath,
      printBackground: true,
      width: "257mm",
      height: "182mm",
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      pageRanges: "1",
    });
  } finally {
    await page.close();
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
  const fileName = `${sanitizePdfFilename(params.filenameBase)}.pdf`;
  const filePath = path.join(exportDir, fileName);
  const baseUrl =
    params.baseUrl ??
    (params.request
      ? resolveBaseUrl(params.request)
      : `http://localhost:${process.env.PORT ?? 3000}`);
  const browser = params.browser ?? (await launchPdfBrowser());
  const ownsBrowser = !params.browser;

  try {
    await exportFinalStretchSheetToPdfWithBrowser(browser, {
      sheetId: params.sheetId,
      sessionToken: params.sessionToken,
      outputPath: filePath,
      baseUrl,
    });
  } catch (error) {
    if (ownsBrowser) await disposePdfBrowser(browser);
    throw error;
  }

  if (!fs.existsSync(filePath)) {
    if (ownsBrowser) await disposePdfBrowser(browser);
    throw new Error("PDF file was not created");
  }

  return { filePath, fileName, browser };
}

export async function closePdfBrowser(browser: Browser | undefined): Promise<void> {
  await disposePdfBrowser(browser);
}
