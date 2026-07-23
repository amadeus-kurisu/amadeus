# notebooklm-mcp

Unofficial [MCP](https://modelcontextprotocol.io) server that lets Claude Code
ask questions of your [NotebookLM](https://notebooklm.google.com) notebooks.

NotebookLM has no public API, so this works by driving the NotebookLM web UI
with a real, signed-in browser (via [Playwright](https://playwright.dev)).
That means:

- **It is unofficial and brittle.** Google can change NotebookLM's markup at
  any time, which will break the selectors in `src/notebooklm.ts`. Treat this
  as a starting point, not a finished product.
- **It is not free of "token cost."** NotebookLM (backed by Gemini) still
  spends compute reading your sources — it just isn't billed against your
  Claude/Anthropic usage. What you save is Claude Code's *context window*,
  since only NotebookLM's answer (not the raw source documents) comes back
  into the conversation.
- **It may be against NotebookLM's Terms of Service** depending on how you
  use it. This is provided for personal experimentation — review Google's
  ToS yourself before relying on it.

## Setup

Run everything below on your own machine, not in a shared/cloud sandbox —
step 2 puts your real Google session on disk.

```bash
cd notebooklm-mcp
npm install
npx playwright install chromium
```

### 1. Log in once

```bash
npm run login
```

This opens a **visible** Chromium window pointed at NotebookLM. Sign in with
your Google account by hand (2FA included — nothing here automates your
credentials). Once your notebook list loads, press Enter in the terminal.
Your session (cookies/localStorage only, never your password) is saved to
`~/.notebooklm-mcp/storage-state.json`.

That file is a bearer credential for your Google session — keep it out of
version control (already covered by `.gitignore`) and treat it like a
password.

### 2. Build

```bash
npm run build
```

### 3. Register with Claude Code

Add to your Claude Code MCP config (e.g. `~/.claude.json` or via `claude mcp add`):

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": ["/absolute/path/to/notebooklm-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Code. Two tools become available:

- `notebooklm_list_notebooks` — lists your notebook titles
- `notebooklm_ask` — asks a question against a given notebook's sources

## When your session expires

Google sessions eventually expire or get invalidated (e.g. password change,
suspicious-activity check). If tool calls start failing, just re-run
`npm run login`.

## Selectors may need fixing

`src/notebooklm.ts` uses best-effort CSS/ARIA selectors for NotebookLM's
current UI. If `notebooklm_list_notebooks` or `notebooklm_ask` stop finding
elements, open the page in a normal browser, inspect the actual DOM, and
update the selectors there.
