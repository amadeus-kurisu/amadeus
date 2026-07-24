import axios, { AxiosError } from "axios";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import {
  MireloApiError,
  MireloAssetUploadResult,
  MireloPreflightResult,
  MireloTranscribeResult,
} from "./types.js";

const API_BASE_URL = "https://api.mirelo.ai/v2/audio-to-midi/v1.0";
const REQUEST_TIMEOUT_MS = 120_000; // sync transcription can take a while for longer tracks

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
};

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

/** Wraps unknown errors (axios or otherwise) into a MireloApiError that preserves the raw status/body. */
function toMireloApiError(error: unknown): MireloApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      const body =
        typeof axiosError.response.data === "string"
          ? axiosError.response.data
          : JSON.stringify(axiosError.response.data);
      return new MireloApiError(axiosError.response.status, axiosError.response.statusText, body);
    }
    if (axiosError.code === "ECONNABORTED") {
      return new MireloApiError(undefined, undefined, "Request timed out");
    }
    return new MireloApiError(undefined, undefined, axiosError.message);
  }
  return new MireloApiError(undefined, undefined, error instanceof Error ? error.message : String(error));
}

export async function preflight(apiKey: string, durationMs: number): Promise<MireloPreflightResult> {
  try {
    const response = await axios.get(`${API_BASE_URL}/preflight`, {
      headers: authHeaders(apiKey),
      params: { duration_ms: durationMs },
      timeout: REQUEST_TIMEOUT_MS,
    });
    return response.data as MireloPreflightResult;
  } catch (error) {
    throw toMireloApiError(error);
  }
}

async function sync(apiKey: string, audio: Record<string, unknown>): Promise<MireloTranscribeResult> {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/sync`,
      { audio },
      {
        headers: { ...authHeaders(apiKey), "Content-Type": "application/json" },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    const data = response.data as { midi_url: string; musicxml_url?: string; notes?: unknown };
    return {
      midi_url: data.midi_url,
      musicxml_url: data.musicxml_url,
      notes: Array.isArray(data.notes) ? (data.notes as MireloTranscribeResult["notes"]) : [],
      raw: data,
    };
  } catch (error) {
    throw toMireloApiError(error);
  }
}

/** Confirmed request shape: POST /sync with {"audio": {"type": "url", "audio_url": "..."}}. */
export function transcribeByUrl(apiKey: string, audioUrl: string): Promise<MireloTranscribeResult> {
  return sync(apiKey, { type: "url", audio_url: audioUrl });
}

/** Confirmed request shape: POST /sync with {"audio": {"type": "asset", "asset_id": "..."}}. */
export function transcribeByAsset(apiKey: string, assetId: string): Promise<MireloTranscribeResult> {
  return sync(apiKey, { type: "asset", asset_id: assetId });
}

/**
 * UNVERIFIED (best-effort, inferred by analogy from Mirelo's video-to-sfx SDK,
 * which uploads bytes via POST /v2/assets -> {asset_id, upload_url} followed by
 * a PUT of the raw bytes). The audio-to-midi docs confirm the *result* of this
 * flow (an asset_id usable in the sync body) but not the exact /v2/assets
 * request/response contract itself -- that part was never observed directly.
 * If this guess is wrong, the Mirelo API's own error response is surfaced
 * unmodified (see MireloApiError) rather than silently failing.
 */
export async function uploadLocalFileAsAsset(apiKey: string, filePath: string): Promise<MireloAssetUploadResult> {
  const contentType = CONTENT_TYPE_BY_EXT[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  const fileBytes = await readFile(filePath);

  let createResponse;
  try {
    createResponse = await axios.post(
      "https://api.mirelo.ai/v2/assets",
      { content_type: contentType },
      {
        headers: { ...authHeaders(apiKey), "Content-Type": "application/json" },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
  } catch (error) {
    throw toMireloApiError(error);
  }

  const { asset_id: assetId, upload_url: uploadUrl } = createResponse.data as {
    asset_id: string;
    upload_url: string;
  };

  try {
    await axios.put(uploadUrl, fileBytes, {
      headers: { "Content-Type": contentType },
      timeout: REQUEST_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } catch (error) {
    throw toMireloApiError(error);
  }

  return { asset_id: assetId };
}
