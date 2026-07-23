import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { NOTEBOOKLM_URL, PROFILE_DIR } from "./config.js";

// Run with `npm run login`. Close every Chrome window first — this copies
// your real, everyday Chrome profile (the one already signed in to Google)
// into a dedicated directory for this MCP server, then opens it to confirm
// NotebookLM loads already signed in.
//
// Why a copy instead of driving a fresh Google sign-in: Playwright-launched
// browsers get flagged by Google's automation checks and the sign-in is
// rejected outright. Reusing a profile that's already authenticated skips
// the sign-in flow entirely, so there's nothing for that check to reject.
// No password is read or copied — only the profile's existing session data.

function findRealChromeUserDataDir(): string {
  const platform = os.platform();
  if (platform === "win32") {
    return path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "User Data");
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome");
  }
  return path.join(os.homedir(), ".config", "google-chrome");
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch {
        // Skip files Chrome still has locked (e.g. if it wasn't fully closed).
      }
    }
  }
}

async function main() {
  const sourceDir = findRealChromeUserDataDir();
  if (!fs.existsSync(sourceDir)) {
    console.error(`Could not find a Chrome profile at ${sourceDir}.`);
    console.error("Set NOTEBOOKLM_MCP_PROFILE_DIR to an already-authenticated Chrome profile instead.");
    process.exit(1);
  }

  console.log(`Copying Chrome profile from ${sourceDir}`);
  console.log(`                        to ${PROFILE_DIR}`);
  console.log("Make sure Chrome is fully closed, or some files may be skipped.");
  console.log("");

  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  copyDir(sourceDir, PROFILE_DIR);

  console.log("Opening NotebookLM with the copied profile to verify it's signed in...");
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(NOTEBOOKLM_URL);

  console.log("");
  console.log("If your notebook list loaded without a sign-in prompt, you're done.");
  console.log("Press Enter in this terminal to finish...");

  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  await context.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
