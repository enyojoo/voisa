# translator-agent

Production-oriented **LiveKit Agents** worker: continuous microphone listening, **Soniox** streaming STT with **two-way translation**, Silero **VAD**, multilingual **turn detection**, and **Soniox realtime Text-to-Speech** over WebSockets ([real-time generation](https://soniox.com/docs/tts/rt/real-time-generation)). Optional **Cartesia** via LiveKit Inference when `VOISA_TTS_PROVIDER=livekit`. It **only translates** (passthrough LLM; no summaries or chat).

## Requirements

- Node **≥ 20**
- LiveKit project (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`)
- Soniox API key (`SONIOX_API_KEY`)

## Setup

```bash
cd translator-agent
cp .env.example .env.local
# Edit .env.local with your keys

npm install
npm run download-files
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Development agent process (`tsx src/agent.ts dev`) |
| `npm run start` | Production-style start |
| `npm run download-files` | Fetch assets required by plugins (e.g. Silero VAD). Turn-taking uses **`turnDetection: 'stt'`** (Soniox events), so Hugging Face ONNX models are **not** required unless you switch back to LiveKit’s multilingual EOU model. |
| `npm run typecheck` | `tsc --noEmit` |

## Agent name & dispatch

The CLI registers this worker as **`translator-agent`** (`ServerOptions.agentName`). That log line means Cloud **knows your worker** and can assign **jobs** to it — it does **not** mean an agent has joined every room automatically.

### Voisa default (recommended)

The Expo app calls Supabase **`livekit-token`**, which uses LiveKit’s **`AgentDispatchClient.createDispatch`** to assign **`translator-agent`** to each `roomName` before returning the JWT. Keep **`npm run dev`** running locally (or deploy the worker); when you tap Play, you should see job/start logs shortly after in this terminal.

### Alternative: LiveKit dashboard dispatch rules

You can configure Cloud **automatic dispatch rules** instead (e.g. match room prefix `voisa-`). If you do, set **`LIVEKIT_SKIP_AGENT_DISPATCH=true`** on the Edge Function so it does **not** also call `createDispatch` (avoid spawning duplicate agents).

Typical Cloud setup without Voisa’s Edge dispatch:

1. Build/push a worker image or run the hosted agent runtime per LiveKit docs.
2. Create a dispatch rule: e.g. match room name prefix `voisa-` or `*` during development.
3. Confirm in dashboard that jobs spawn when the Expo client connects.

## Soniox adapter

`src/soniox_stt.ts` opens Soniox’s WebSocket API directly with `translation.type: "two_way"` and streams PCM **16 kHz mono s16le** from the agent audio pipeline.

The Voisa Expo client does **not** embed `@soniox/react` / `@soniox/client`; microphone audio reaches Soniox **through LiveKit → this worker**, which keeps **`SONIOX_API_KEY`** off the device. Soniox documents a [React Native SDK](https://soniox.com/docs/sdk/react-native-SDK) for apps that stream PCM **directly from the phone** with server-issued temporary keys ([React SDK temporary-key setup](https://soniox.com/docs/sdk/react-SDK#set-up-your-temporary-api-key-endpoint)) — that is a different architecture than Voisa’s agent-mediated translation pipeline.

**Languages:** Soniox supports many pairs, not only English ↔ Spanish. Environment variables `TRANSLATION_LANGUAGE_A` / `TRANSLATION_LANGUAGE_B` are **startup defaults only** (often **en** / **es**) until the client overrides them. The Voisa app publishes `voisa.language_pair` over LiveKit (`RoomEvent.DataReceived`); `src/agent.ts` calls `applyLanguagePair`, which updates `language_a` / `language_b` and reconnects the Soniox websocket when needed. Allowed codes match `src/soniox_language_allowlist.ts` (same set as Expo `lib/sonioxLanguages.ts`).

**Limits ([Soniox quotas](https://soniox.com/docs/stt/rt/limits-and-quotas)):** Default account caps include ~**100** realtime session starts **per minute**, **10 concurrent** WebSocket sessions, and **300 minutes** of continuous audio **per session** (hard cap — continue by opening a new session; Voisa does this automatically on reconnect/retry after disconnect). Higher limits (except stream duration) can be requested in the Soniox Console.

**Error handling ([Soniox RT errors](https://soniox.com/docs/stt/rt/error-handling)):** Failures come back as JSON **`error_code`** + **`error_message`**, then Soniox closes the socket — always inspect both (full list: [WebSocket API → Error response](https://soniox.com/docs/api-reference/stt/websocket-api#error-response)). Early termination often surfaces as **`503`** with text like “Cannot continue request…” — treat it like a disconnect and **start a new session**; this worker reconnects with backoff for retryable codes (billing/auth **`401`–`403`** surface as fatal via `voisa.agent_status`). Send audio at **real-time or near–real-time** pace; prolonged bursts or long stalls can trigger disconnects — Voisa forwards small PCM chunks (~20 ms) from the mic pipeline.

Transcript payloads are published to the room with `localParticipant.publishData` as JSON:

```json
{
  "type": "voisa.transcript",
  "original": "...",
  "translated": "...",
  "detectedLanguage": "en",
  "isFinal": false
}
```

The Expo hook listens on `RoomEvent.DataReceived`.

## Soniox realtime TTS

`src/soniox_tts.ts` connects to **`wss://tts-rt.soniox.com/tts-websocket`** ([API reference](https://soniox.com/docs/api-reference/tts/websocket-api)): after a per-stream JSON **config** (`model`, `language`, `voice`, `audio_format`, `sample_rate`, …), text from the LiveKit pipeline is forwarded as **`text` / `text_end`** chunks while **`audio`** (base64 PCM) returns **interleaved** with upstream tokens — same lifecycle as Soniox’s [real-time generation](https://soniox.com/docs/tts/rt/real-time-generation) guide. **Normal teardown** follows Soniox’s three-step handshake ([stream termination](https://soniox.com/docs/tts/rt/termination)): client **`text_end: true`** → server **`audio_end: true`** → **`terminated: true`** per `stream_id` (then safe to unregister / reuse id). LiveKit **`flush`** boundaries end one Soniox stream and start the next. **User interruption / synthesis abort** sends Soniox **`cancel: true`** for the active `stream_id`, which ends with **`terminated`** without requiring further audio.

**Multiplexed streams ([Soniox streams](https://soniox.com/docs/tts/rt/streams)):** One worker process keeps a **shared** TTS websocket per `(SONIOX_API_KEY, SONIOX_TTS_WS_URL)` so overlapping LiveKit synthesize sessions can share connection overhead; inbound frames are routed by **`stream_id`**. Soniox allows up to **5** concurrent streams **per websocket** — the mux registers handlers before each config and enforces that cap (validation / malformed payloads without a running stream are logged — see Soniox **error isolation**). Terminating one stream **does not** close the socket; other streams continue ([termination overview](https://soniox.com/docs/tts/rt/termination)). **Keepalive:** the mux sends **`{"keep_alive":true}`** on a timer (default **25s**, override **`SONIOX_TTS_KEEPALIVE_INTERVAL_MS`**) per [connection keepalive](https://soniox.com/docs/tts/rt/connection-keepalive) so idle gaps between turns or streams do not drop the shared socket.

**Limits ([Soniox TTS quotas](https://soniox.com/docs/tts/rt/limits-and-quotas)):** Defaults include ~**100** TTS websocket requests **per minute**, **3 concurrent** realtime TTS **websocket connections**, **5 streams per connection** (fixed), and **2 minutes** max **per stream** (fixed — continue with a **new** `stream_id`; Voisa ends streams at LiveKit **`flush`** boundaries and on cancel). Higher limits (**except** streams-per-connection and per-stream duration) can be requested in the [Soniox Console limits](https://console.soniox.com/org/limits). This worker shares **one** TTS socket per `(SONIOX_API_KEY, SONIOX_TTS_WS_URL)` to stay within connection quotas.

**Provider switch:** Set **`VOISA_TTS_PROVIDER=soniox`** (default) or **`livekit`** to use **`inference.TTS`** (`cartesia/sonic-3`) instead.

**Language:** Startup defaults follow **`SONIOX_TTS_LANGUAGE`** or **`TRANSLATION_LANGUAGE_B`**. When the app sends **`voisa.language_pair`**, `languageB` is applied to Soniox TTS (`setLanguage`) so spoken output matches the **translated** text.

## LiveKit Inference TTS (optional)

When **`VOISA_TTS_PROVIDER=livekit`**, `src/agent.ts` uses `inference.TTS` with `cartesia/sonic-3`. Ensure your LiveKit project has Inference enabled and the model is available; swap `model` / `voice` if your account uses different inference IDs.

## Troubleshooting

- **Stopping the worker (“won’t close”)**: Use **Ctrl+C** in the terminal where **`npm run dev`** runs. **`pkill -f translator-agent`** often hits **LiveKit job children** (`job_proc_lazy_main.js … src/agent.ts`) so you see **SIGTERM received in job proc**, but the **parent `tsx`** process (or **orphaned job workers**) may keep running. To stop everything tied to this repo: **`pkill -INT -f "translator-agent/src/agent.ts"`**, wait ~5s for RTC teardown, then **`pkill -9 -f "translator-agent/src/agent.ts"`** if anything is left (**`pgrep -fl translator-agent/src/agent`** should print nothing).
- **No agent in room**: This is usually **missing dispatch**, not a missing worker. Confirm **`livekit-token`** is deployed (it calls `createDispatch`), or add a dashboard dispatch rule. Logs showing `registered worker` only prove the worker is online.
- **Soniox `429` / concurrent session limits**: Defaults allow **10 simultaneous** realtime WebSockets and **~100** session starts/min — duplicate workers or aggressive reconnect loops can hit this. Run **one** translator-agent process; retries back off automatically for transient **`429`** responses (non-fatal). See [STT limits & quotas](https://soniox.com/docs/stt/rt/limits-and-quotas).
- **Soniox TTS `429` / connection limits**: Realtime TTS defaults include ~**100** requests/min and **3 concurrent** websocket connections — duplicate workers or extra processes each holding a TTS mux can hit this; Voisa multiplexes streams on **one** shared TTS socket per API key when possible. See [TTS limits & quotas](https://soniox.com/docs/tts/rt/limits-and-quotas) and [Console limits](https://console.soniox.com/org/limits).
- **Soniox `503` / early session end**: Real-time sessions are **best-effort**; Soniox may close before the duration cap with **`503`** (“Cannot continue request…”). Logs include **`error_code`** / **`error_message`**; the worker opens a **new** websocket after backoff. See [error handling](https://soniox.com/docs/stt/rt/error-handling).
- **Soniox errors (402 / billing)**: Soniox returns `402` when organization balance is exhausted — add credits or enable autopay in the Soniox dashboard. The agent publishes `voisa.agent_status` to the app when it detects non-retryable Soniox failures.
- **Soniox `408` spam / reconnect storms**: Usually **several agent processes** are running (multiple `npm run dev`, Cursor terminals, or orphaned **`job_proc`** workers). Each dead job used to sit in a **long retry loop**, so Soniox saw overlapping sockets and timeouts. Run **one** worker; stop strays with **`pkill -INT -f "translator-agent/src/agent.ts"`** (then **`pkill -9`** if needed). After pulling latest `soniox_stt.ts`, retries **abort immediately** when the session shuts down instead of sleeping on a timer.
- **`AbortError` / “Unhandled promise rejection” during disconnect**: Often LiveKit **`Room.cleanupOnDisconnect`** aborting tasks while a job exits — noisy but typically **harmless** when you intentionally ended the session or a new job replaced an old one.
- **Soniox TTS stream / mux limits**: Soniox allows **5** multiplexed **`stream_id`** values **per** TTS websocket ([streams](https://soniox.com/docs/tts/rt/streams)); each stream is also capped at **2 minutes** ([TTS quotas](https://soniox.com/docs/tts/rt/limits-and-quotas)). This worker enforces the stream cap and opens **new** streams on **`flush`**; hitting caps throws — rare unless many overlapping synthesize jobs run at once; consider **`VOISA_TTS_PROVIDER=livekit`** for extreme concurrency.
- **No translated audio**: Verify `SONIOX_API_KEY`, translation language codes, Soniox TTS voice/language env vars, and Soniox dashboard quotas (including billing). For **`VOISA_TTS_PROVIDER=livekit`**, confirm Inference / Cartesia is enabled.
- **download-files fails**: Run from this directory with network access; retry after CDN blips.
