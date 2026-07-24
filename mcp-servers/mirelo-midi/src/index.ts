#!/usr/bin/env node
/**
 * MCP server for the Mirelo Audio-to-MIDI API.
 *
 * Given a finished audio mix (song, DJ set, etc.), transcribes it into a
 * multi-instrument MIDI file + MusicXML via https://api.mirelo.ai.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename, isAbsolute } from "node:path";
import {
  preflight,
  transcribeByAsset,
  transcribeByUrl,
  uploadLocalFileAsAsset,
} from "./mirelo-client.js";
import { MireloApiError, MireloTranscribeResult } from "./types.js";

const DEFAULT_OUTPUT_DIR = join(homedir(), "mirelo-midi-output");

function requireApiKey(): string {
  const apiKey = process.env.MIRELO_API_KEY;
  if (!apiKey) {
    console.error("ERROR: MIRELO_API_KEY environment variable is required");
    process.exit(1);
  }
  return apiKey;
}

function formatError(error: unknown): string {
  if (error instanceof MireloApiError) {
    return `Error: ${error.message}`;
  }
  return `Error: Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
}

async function downloadTo(url: string, destPath: string): Promise<void> {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  await writeFile(destPath, response.data);
}

async function saveResultLocally(
  result: MireloTranscribeResult,
  outputDir: string,
  baseName: string,
): Promise<{ midi_path: string; musicxml_path?: string }> {
  await mkdir(outputDir, { recursive: true });

  const midiPath = join(outputDir, `${baseName}.mid`);
  await downloadTo(result.midi_url, midiPath);

  let musicxmlPath: string | undefined;
  if (result.musicxml_url) {
    musicxmlPath = join(outputDir, `${baseName}.musicxml`);
    await downloadTo(result.musicxml_url, musicxmlPath);
  }

  return { midi_path: midiPath, musicxml_path: musicxmlPath };
}

function summarize(result: MireloTranscribeResult, localPaths: { midi_path: string; musicxml_path?: string }): string {
  const instruments = [...new Set(result.notes.map((n) => n.instrument))].sort();
  const lines = [
    `Transcribed ${result.notes.length} notes across ${instruments.length} instrument track(s): ${instruments.join(", ") || "(none detected)"}`,
    `MIDI saved to: ${localPaths.midi_path}`,
  ];
  if (localPaths.musicxml_path) {
    lines.push(`MusicXML saved to: ${localPaths.musicxml_path}`);
  } else {
    lines.push("MusicXML was not returned by the API for this request.");
  }
  return lines.join("\n");
}

const server = new McpServer({
  name: "mirelo-midi-mcp-server",
  version: "1.0.0",
});

const TranscribeInputShape = {
  audio_url: z
    .string()
    .url()
    .optional()
    .describe("Publicly accessible URL of the audio file to transcribe. Use this OR file_path, not both."),
  file_path: z
    .string()
    .optional()
    .describe(
      "Absolute path to a local audio file to transcribe. Use this OR audio_url, not both. " +
        "NOTE: local file upload relies on an unverified Mirelo endpoint (POST /v2/assets) inferred " +
        "by analogy from another Mirelo product's SDK -- prefer audio_url when possible until this has been " +
        "confirmed to work.",
    ),
  output_dir: z
    .string()
    .optional()
    .describe(`Local directory to save the resulting .mid/.musicxml files. Defaults to ${DEFAULT_OUTPUT_DIR}.`),
};
const TranscribeInputSchema = z.object(TranscribeInputShape).strict();

type TranscribeInput = z.infer<typeof TranscribeInputSchema>;

server.registerTool(
  "mirelo_audio_to_midi",
  {
    title: "Transcribe Audio to MIDI (Mirelo)",
    description: `Transcribe a finished audio mix (song, DJ set, stems, etc.) into a multi-instrument MIDI file + MusicXML using the Mirelo Audio-to-MIDI API.

Unlike stem-separation-based tools, Mirelo transcribes directly from a full mix and detects individual instruments (drums, bass, keys, vocals, etc.), returning a separate track per instrument.

Args:
  - audio_url (string, optional): Publicly accessible URL to the audio file. Use this OR file_path.
  - file_path (string, optional): Absolute path to a local audio file. Use this OR audio_url. UNVERIFIED upload path -- prefer audio_url when available.
  - output_dir (string, optional): Where to save the resulting .mid/.musicxml files locally. Defaults to ~/mirelo-midi-output.

Returns: A summary of detected instruments/note count, plus the local file paths where the MIDI and MusicXML were saved (the API's own URLs are presigned and expire after about an hour, so results are always downloaded locally).

This is a synchronous call: it blocks until Mirelo finishes transcribing, which can take significantly longer than the audio's own duration for longer tracks.

Error Handling:
  - Returns the Mirelo API's own status code and error message unmodified if the request fails (e.g. unsupported format, invalid URL, insufficient credits).`,
    inputSchema: TranscribeInputShape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params: TranscribeInput) => {
    if ((params.audio_url ? 1 : 0) + (params.file_path ? 1 : 0) !== 1) {
      return {
        isError: true,
        content: [{ type: "text", text: "Error: Provide exactly one of audio_url or file_path." }],
      };
    }

    const apiKey = requireApiKey();
    try {
      let result: MireloTranscribeResult;
      let sourceName: string;

      if (params.audio_url) {
        result = await transcribeByUrl(apiKey, params.audio_url);
        sourceName = basename(new URL(params.audio_url).pathname) || "transcription";
      } else {
        const filePath = params.file_path!;
        if (!isAbsolute(filePath)) {
          return {
            isError: true,
            content: [{ type: "text", text: `Error: file_path must be an absolute path, got: ${filePath}` }],
          };
        }
        const { asset_id } = await uploadLocalFileAsAsset(apiKey, filePath);
        result = await transcribeByAsset(apiKey, asset_id);
        sourceName = basename(filePath);
      }

      const outputDir = params.output_dir ?? DEFAULT_OUTPUT_DIR;
      const baseName = sourceName.replace(/\.[^/.]+$/, "") || "transcription";
      const localPaths = await saveResultLocally(result, outputDir, baseName);

      const output = {
        note_count: result.notes.length,
        instruments: [...new Set(result.notes.map((n) => n.instrument))].sort(),
        midi_path: localPaths.midi_path,
        musicxml_path: localPaths.musicxml_path,
        midi_url: result.midi_url,
        musicxml_url: result.musicxml_url,
      };

      return {
        content: [{ type: "text", text: summarize(result, localPaths) }],
        structuredContent: output,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: formatError(error) }],
      };
    }
  },
);

const PreflightInputSchema = z
  .object({
    duration_ms: z.number().int().positive().describe("Duration of the audio in milliseconds."),
  })
  .strict();

type PreflightInput = z.infer<typeof PreflightInputSchema>;

server.registerTool(
  "mirelo_preflight",
  {
    title: "Check Mirelo Audio-to-MIDI Cost/Time Estimate",
    description: `Check the credit cost and estimated processing time for transcribing an audio file, WITHOUT actually running the transcription.

Args:
  - duration_ms (integer, required): Duration of the audio in milliseconds.

Returns: { "credits": number, "estimated_ms": number }

Use this before mirelo_audio_to_midi when you want to confirm cost/time first, e.g. for a long track.`,
    inputSchema: PreflightInputSchema.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params: PreflightInput) => {
    const apiKey = requireApiKey();
    try {
      const result = await preflight(apiKey, params.duration_ms);
      const output = { credits: result.credits, estimated_ms: result.estimated_ms };
      return {
        content: [
          {
            type: "text",
            text: `Estimated cost: ${output.credits} credits, estimated time: ${output.estimated_ms}ms`,
          },
        ],
        structuredContent: output,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: formatError(error) }],
      };
    }
  },
);

async function main(): Promise<void> {
  requireApiKey();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mirelo-midi-mcp-server running via stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
