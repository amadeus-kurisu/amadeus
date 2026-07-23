import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { askNotebook, closeBrowser, listNotebooks } from "./notebooklm.js";

const server = new McpServer({
  name: "notebooklm-mcp",
  version: "0.1.0",
});

server.registerTool(
  "notebooklm_list_notebooks",
  {
    description: "List the notebook titles available in the signed-in NotebookLM account.",
    inputSchema: {},
  },
  async () => {
    const notebooks = await listNotebooks();
    return {
      content: [{ type: "text", text: JSON.stringify(notebooks, null, 2) }],
    };
  },
);

server.registerTool(
  "notebooklm_ask",
  {
    description:
      "Ask a question grounded in the sources of a specific NotebookLM notebook, and return NotebookLM's answer.",
    inputSchema: {
      notebook: z.string().describe("Notebook title (or a distinctive substring of it)"),
      question: z.string().describe("The question to ask, answered using that notebook's sources"),
    },
  },
  async ({ notebook, question }) => {
    const answer = await askNotebook(notebook, question);
    return {
      content: [{ type: "text", text: answer }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
