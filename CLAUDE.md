# amadeus

## MCP servers

### mirelo-midi (`mcp-servers/mirelo-midi/`)

Local stdio MCP server wrapping the [Mirelo Audio-to-MIDI API](https://mirelo.ai/models/audio-to-midi). Given a finished audio mix, transcribes it into a multi-instrument MIDI file + MusicXML (separate tracks per instrument: drums, bass, keys, etc.).

**Setup:**
1. `cd mcp-servers/mirelo-midi && npm install && npm run build`
2. Set your API key as an environment variable — never commit it. Either export it in your shell, or copy `.env.example` to `.env` (gitignored) and fill it in.
3. Register the server with your MCP client (e.g. Claude Code) pointing at `mcp-servers/mirelo-midi/dist/index.js`, with `MIRELO_API_KEY` set in its environment.

**Tools:**
- `mirelo_audio_to_midi(audio_url | file_path, output_dir?)` — transcribes audio to MIDI/MusicXML, saves the results locally (the API's result URLs are presigned and expire after ~1h). `audio_url` (a public URL) is fully verified end-to-end. `file_path` (local file upload) relies on an **unverified** `/v2/assets` upload flow inferred by analogy from another Mirelo product's SDK — prefer `audio_url` until this has been confirmed working.
- `mirelo_preflight(duration_ms)` — checks credit cost / estimated time before running a transcription.

**Usage example:** "この曲MIDI化して" with a URL or local path to the track — Claude will call `mirelo_audio_to_midi` and report back the detected instruments and where the `.mid`/`.musicxml` files were saved.

**Verified behavior:** confirmed working end-to-end via Mirelo Studio's API Playground (real audio file in, real multi-track MIDI + MusicXML out — see PR #2 for details). The MCP server itself could not be exercised against the live API from within the cloud session that built it, because that session's network egress policy blocks `api.mirelo.ai`; run it locally to confirm before relying on it.
