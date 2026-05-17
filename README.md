# Voisa — LiveKit realtime translation

Expo (React Native) clients join a LiveKit room with microphone audio published continuously. A Node.js **LiveKit Agent** (`translator-agent`) is dispatched into the same room, runs **Soniox** streaming STT with **two-way translation** (default English ↔ Spanish), and speaks translated audio via **Soniox realtime TTS** (default) or **LiveKit Inference / Cartesia** when configured. Interim and final transcripts plus detected language are bridged to the app over LiveKit **data** packets (`voisa.transcript`).

## Architecture

```
Expo app  →  Supabase Edge Function `livekit-token` (JWT + explicit AgentDispatch + LIVEKIT_URL)
         →  LiveKit Cloud assigns a job to your registered worker (`translator-agent`)
         →  your user participant(s) in the same room
```

**Important:** Workers that log `registered worker` are only *available to take jobs*. LiveKit still needs a **dispatch** (per room) before the agent joins. This repo’s `livekit-token` function calls [`AgentDispatchClient.createDispatch`](https://docs.livekit.io/server-sdk-js/classes/AgentDispatchClient.html) for each `roomName` unless you opt out (see secrets below). You do **not** need a separate Cloud “dispatch rule” unless you prefer that workflow.

- **Frontend**: `@livekit/react-native`, Expo config plugins for WebRTC (see `app.json`).
- **Soniox**: Only **`translator-agent`** holds `SONIOX_API_KEY` and opens Soniox WebSockets. The Expo app publishes mic audio via **LiveKit** only — there is **no** `@soniox/react` / `@soniox/client` dependency. Soniox’s [React Native SDK](https://soniox.com/docs/sdk/react-native-SDK) describes **direct** mobile → Soniox realtime STT (custom `AudioSource`, server-issued temporary keys); Voisa uses LiveKit → **agent** → Soniox instead.
- **Token API**: `supabase/functions/livekit-token` — authenticated users call `invoke` with `{ roomName, participantName }`. The function mints the JWT **and** dispatches `translator-agent` into that room (same `agentName` as `translator-agent/src/agent.ts`).
- **Agent**: `translator-agent/` — `@livekit/agents` voice pipeline with Silero VAD, **STT-based turn detection** (Soniox `START_OF_SPEECH` / `END_OF_SPEECH` / finals — no Hugging Face ONNX download required), Soniox WebSocket STT adapter, passthrough LLM (translation text comes from Soniox), **Soniox realtime TTS** by default (`VOISA_TTS_PROVIDER=soniox`), optional Cartesia via Inference (`livekit`).

## Prerequisites

- Node.js **≥ 20**
- Supabase project (Edge Functions enabled)
- LiveKit Cloud project (or self-hosted LiveKit) with API key / secret
- Soniox API key (two-way translation over WebSocket)

## Environment variables

### Expo app (`.env` / EAS)

See `.env.example`. Required:

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |

The LiveKit **WebSocket URL** is returned by `livekit-token` at runtime (`url` field); it is not baked into the client.

Use a **development build** (`npx expo run:ios` / `run:android`). LiveKit requires native WebRTC; **Expo Go is not sufficient** for production realtime audio.

### Supabase secrets (Edge Function)

Set these for the deployed function (and local Supabase if you serve functions locally):

```bash
supabase secrets set LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
supabase secrets set LIVEKIT_API_KEY=...
supabase secrets set LIVEKIT_API_SECRET=...
# Optional — only if you use another mechanism to dispatch agents and want to avoid double-dispatch:
# supabase secrets set LIVEKIT_SKIP_AGENT_DISPATCH=true
# Optional — default agent name is translator-agent (must match translator-agent worker registration):
# supabase secrets set LIVEKIT_AGENT_NAME=translator-agent
```

Successful responses include **`dispatchPath`** (`create_room_agents` is normal for new rooms): it confirms the function created the LiveKit room with an embedded agent dispatch **before** your phone joins.

Deploy:

```bash
supabase functions deploy livekit-token
```

Edge Functions run on **Deno** (`npm:` / `jsr:` imports). If your IDE reports missing `Deno` or `npm:…` modules on `supabase/functions/**`, install the **Deno** VS Code/Cursor extension — this repo enables it only under `supabase/functions` via `.vscode/settings.json`.

With `verify_jwt = true` in `supabase/config.toml`, callers must pass a valid Supabase session (the Expo app uses the logged-in user’s JWT via `supabase.auth.getSession()` through `invoke`).

### Translator agent (`translator-agent/.env.local`)

Copy `translator-agent/.env.example` → `.env.local`. Required:

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `SONIOX_API_KEY`
- Optional: `TRANSLATION_LANGUAGE_A`, `TRANSLATION_LANGUAGE_B` (translator-agent **defaults only** before the app sends `voisa.language_pair`; all Soniox-listed pairs in the app work at runtime), `SONIOX_MAX_ENDPOINT_DELAY_MS`, `TRANSCRIPT_FINALIZE_QUIET_MS`, `VOISA_TTS_PROVIDER`, `SONIOX_TTS_*` (see `translator-agent/.env.example`)

## Run locally

### 1. Translator agent

```bash
cd translator-agent
npm install
npm run download-files   # Silero VAD assets (first time); ONNX turn-detector models not required with Soniox STT turns
npm run dev              # connects outbound to LiveKit; waits for Agent Dispatch jobs from Cloud
```

See **`translator-agent/README.md`** for registering this worker with LiveKit Cloud. Room dispatch is triggered by **`livekit-token`** when users start a session (no dashboard dispatch rule required unless you disable that behavior).

### 2. Supabase function (optional local)

```bash
supabase start
supabase functions serve livekit-token --env-file ./supabase/.env.local
```

Point Expo at local Supabase URL/keys if testing locally.

### 3. Expo app

```bash
npm install
npx expo prebuild   # if needed after native dependency changes
npx expo run:ios    # or run:android
```

Open the translate screen, sign in (required for JWT-verified token calls), tap **Play**: mic permission → token → connect → publish audio.

## LiveKit Console checklist

1. Create a project and note `LIVEKIT_URL`, API key, and secret (must allow server APIs used by `AgentDispatchClient`, same as typical RoomService usage).
2. Run or deploy the **`translator-agent`** worker so it shows as **registered** in Cloud; it receives **jobs** after `livekit-token` creates each **`voisa-*`** room via **`RoomService.CreateRoom`** (with embedded **`agents`** / `translator-agent`), falling back to **`AgentDispatchClient.createDispatch`** when the room already exists. (If you use dashboard **automatic dispatch rules**, set `LIVEKIT_SKIP_AGENT_DISPATCH=true` so you do not dispatch twice.)
3. When using **`VOISA_TTS_PROVIDER=livekit`**, ensure Inference / TTS is enabled for your project (`cartesia/sonic-3`).

## Repo layout

| Path | Role |
|------|------|
| `app/` | Expo Router screens |
| `hooks/useLiveKitTranslator.ts` | Room connection, mic, data-channel transcripts |
| `lib/livekit/token.ts` | Supabase `livekit-token` invoke |
| `supabase/functions/livekit-token/` | Signed JWT, `url`, and **agent dispatch** for the room |
| `translator-agent/` | Node LiveKit Agents worker |

## Docs references

- [LiveKit Expo](https://docs.livekit.io/transport/sdk-platforms/expo/)
- [Voice AI / Agents](https://docs.livekit.io/agents/start/voice-ai/)
- [Soniox React Native SDK](https://soniox.com/docs/sdk/react-native-SDK) (Voisa’s Expo client does not use `@soniox/react`; Soniox runs in `translator-agent`.)
- [Soniox STT](https://docs.livekit.io/agents/models/stt/soniox/) (this repo uses a **custom Node WebSocket client** in `translator-agent/src/soniox_stt.ts`; there is no official `@livekit/agents-plugin-soniox` npm package for Node at time of writing.)
- [Soniox realtime TTS](https://soniox.com/docs/tts/rt/real-time-generation) (`translator-agent/src/soniox_tts.ts` implements the [WebSocket API](https://soniox.com/docs/api-reference/tts/websocket-api) for playback.)
- [Soniox TTS limits & quotas](https://soniox.com/docs/tts/rt/limits-and-quotas)
