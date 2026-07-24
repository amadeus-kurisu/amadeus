// Types for the Mirelo Audio-to-MIDI API (https://api.mirelo.ai/v2/audio-to-midi/v1.0)
//
// Confirmed empirically (2026-07-24) via the official docs + a real call made
// through Mirelo Studio's API Playground with a real audio file. The `sync`
// response may contain additional fields beyond the ones listed here (the
// full response was not observed in every field) — this type only asserts
// what was actually seen, and MireloTranscribeResult keeps an `raw` escape
// hatch so nothing is silently dropped.

export interface MireloNote {
  pitch: number;
  start: number;
  end: number;
  instrument: string;
  velocity: number;
}

export interface MireloTranscribeResult {
  midi_url: string;
  musicxml_url?: string;
  notes: MireloNote[];
  /** Full, unmodified JSON response, in case the API returns fields not modeled above. */
  raw: unknown;
}

export interface MireloPreflightResult {
  credits: number;
  estimated_ms: number;
}

/** Confirmed via Mirelo Studio Playground: shape returned once a file has been uploaded to an asset. */
export interface MireloAssetUploadResult {
  asset_id: string;
}

export class MireloApiError extends Error {
  constructor(
    public readonly status: number | undefined,
    public readonly statusText: string | undefined,
    public readonly body: string,
  ) {
    super(
      status !== undefined
        ? `Mirelo API error ${status} ${statusText ?? ""}: ${body}`.trim()
        : `Mirelo API request failed: ${body}`,
    );
    this.name = "MireloApiError";
  }
}
