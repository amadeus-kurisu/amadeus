import fs from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { HEADLESS, NOTEBOOKLM_URL, PROFILE_DIR } from "./config.js";

// This talks to NotebookLM by driving its web UI, since Google does not
// publish a NotebookLM API. It is inherently brittle: Google can change
// the page's markup at any time, which will break the selectors below.
// Treat this as a starting point to patch up, not a finished integration.

let context: BrowserContext | undefined;

async function getContext(): Promise<BrowserContext> {
  if (context) return context;

  if (!fs.existsSync(PROFILE_DIR)) {
    throw new Error(`No Chrome profile found at ${PROFILE_DIR}. Run \`npm run login\` first.`);
  }

  const profileDirNameFile = path.join(PROFILE_DIR, "profile-directory-name.txt");
  const profileDirName = fs.existsSync(profileDirNameFile)
    ? fs.readFileSync(profileDirNameFile, "utf-8").trim()
    : "Default";

  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: HEADLESS,
    args: [`--profile-directory=${profileDirName}`],
  });
  return context;
}

async function openNotebook(page: Page, notebookName: string): Promise<void> {
  await page.goto(NOTEBOOKLM_URL);
  await page.waitForLoadState("networkidle");

  const notebookLink = page.getByRole("link", { name: notebookName, exact: false }).first();
  await notebookLink.waitFor({ timeout: 15_000 });
  await notebookLink.click();
  await page.waitForLoadState("networkidle");
}

export async function listNotebooks(): Promise<string[]> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await page.goto(NOTEBOOKLM_URL);
    await page.waitForLoadState("networkidle");

    // Notebook tiles on the landing page. Selector is a best-effort guess
    // based on NotebookLM's current layout — adjust if it stops matching.
    const titles = await page
      .locator("[data-test-id='notebook-title'], .project-title, .notebook-title")
      .allTextContents();

    return titles.map((t) => t.trim()).filter(Boolean);
  } finally {
    await page.close();
  }
}

export async function askNotebook(notebookName: string, question: string): Promise<string> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await openNotebook(page, notebookName);

    const chatInput = page.getByRole("textbox", { name: /query|ask|message/i }).first();
    await chatInput.waitFor({ timeout: 15_000 });
    await chatInput.fill(question);
    await chatInput.press("Enter");

    // Wait for a new assistant response to render, then grab the latest one.
    const responseLocator = page.locator("[data-test-id='chat-response'], .response-text").last();
    await responseLocator.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(2_000); // let streaming finish

    return (await responseLocator.textContent())?.trim() ?? "";
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  await context?.close();
  context = undefined;
}
