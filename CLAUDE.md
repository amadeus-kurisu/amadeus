# amadeus

Personal utilities repo for tools that connect Claude to other services.

## notebooklm-mcp

`notebooklm-mcp/` is an unofficial MCP server for querying Google NotebookLM
notebooks. See `notebooklm-mcp/README.md` for the full setup.

Key facts worth knowing before touching this code:

- NotebookLM has no public API. This works by driving a real, already
  signed-in Chrome profile — never by having Playwright drive a fresh Google
  sign-in, which Google's automation checks reject outright.
- `npm run login` copies the user's real Chrome profile (auto-detecting the
  signed-in profile directory via `Local State`, since it isn't always
  `Default`) into `~/.notebooklm-mcp/chrome-profile`, then verifies NotebookLM
  loads already authenticated.
- In practice, the actively-maintained third-party CLI
  [`notebooklm-mcp-cli`](https://pypi.org/project/notebooklm-mcp-cli/)
  (`uv tool install notebooklm-mcp-cli`, then `nlm login`) turned out to be a
  more reliable path than this repo's hand-rolled Playwright scraper — it
  extracts cookies after a real (non-CDP-driven) login instead of continuing
  to drive an automated browser, which is what let it avoid Google's
  automation block. The in-repo server is kept as a reference implementation,
  not the recommended day-to-day tool.
- This all runs on the user's own Windows machine (Claude Desktop), never in
  a shared/cloud sandbox — the profile directory is a bearer credential for
  a real Google session.

## Environment notes

- Development happens both here (a cloud session with push access to this
  repo) and on the user's Windows PC (where Claude Desktop, NotebookLM login,
  and MCP servers actually run). Changes to `notebooklm-mcp/` need to be
  pulled and rebuilt (`npm run build`) on the Windows side to take effect.
- Local MCP servers on the Windows machine are configured by hand-editing
  `claude_desktop_config.json` under `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\`
  — Claude Desktop's UI has no "add server" form, only an "edit config"
  button that opens this file.
