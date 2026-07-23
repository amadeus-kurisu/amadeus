import os from "node:os";
import path from "node:path";

export const NOTEBOOKLM_URL = "https://notebooklm.google.com/";

// A dedicated Chrome profile directory, seeded once (see login.ts) from your
// real, everyday Chrome profile so it's already signed in to Google. Reusing
// an already-authenticated profile means Playwright never has to drive a
// fresh Google sign-in flow, which Google's automation checks reject anyway.
export const PROFILE_DIR =
  process.env.NOTEBOOKLM_MCP_PROFILE_DIR ??
  path.join(os.homedir(), ".notebooklm-mcp", "chrome-profile");

export const HEADLESS = process.env.NOTEBOOKLM_MCP_HEADLESS !== "false";
