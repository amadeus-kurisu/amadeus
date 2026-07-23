import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { NOTEBOOKLM_URL, STORAGE_STATE_PATH } from "./config.js";

// Run with `npm run login`. Opens a real, visible browser window so *you*
// can sign in to your Google account by hand (2FA included). No password
// or credential ever passes through this script or gets written to disk —
// only the resulting session cookies/localStorage are saved, and only to
// STORAGE_STATE_PATH on your own machine.
async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(NOTEBOOKLM_URL);

  console.log("A browser window has opened.");
  console.log("Sign in to your Google account there, then wait until your");
  console.log("NotebookLM notebook list is visible.");
  console.log("");
  console.log("Press Enter in this terminal once you're logged in...");

  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`Saved session to ${STORAGE_STATE_PATH}`);

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
