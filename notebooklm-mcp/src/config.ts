import os from "node:os";
import path from "node:path";

export const NOTEBOOKLM_URL = "https://notebooklm.google.com/";

// Playwright storageState (cookies + localStorage) lives outside the repo,
// in the user's home directory, so it never gets committed or read by
// anything other than the local Playwright browser that created it.
export const STORAGE_STATE_PATH =
  process.env.NOTEBOOKLM_MCP_STORAGE_STATE ??
  path.join(os.homedir(), ".notebooklm-mcp", "storage-state.json");

export const HEADLESS = process.env.NOTEBOOKLM_MCP_HEADLESS !== "false";
