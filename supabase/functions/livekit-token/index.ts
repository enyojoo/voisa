import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  AccessToken,
  AgentDispatchClient,
  RoomAgentDispatch,
  RoomServiceClient,
} from "npm:livekit-server-sdk@2.15.3";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  roomName?: string;
  participantName?: string;
};

export type DispatchPath =
  | "create_room_agents"
  | "explicit_dispatch"
  | "explicit_dispatch_skip"
  /** Room existed but listDispatch failed after retries — skipped createDispatch to avoid duplicate agents (embedded dispatch from CreateRoom may still be present). */
  | "explicit_dispatch_skip_unverified_list";

/** Agent Dispatch uses HTTPS Twirp; LIVEKIT_URL is normally wss:// for RTC. */
function livekitHttpHost(wsUrl: string): string {
  const u = wsUrl.trim();
  if (u.startsWith("wss://")) return `https://${u.slice(6)}`;
  if (u.startsWith("ws://")) return `http://${u.slice(5)}`;
  return u;
}

/** Duck-typed Twirp errors from livekit-server-sdk (avoids brittle `instanceof` when resolution differs between Deno IDE vs runtime). */
function isTwirpLike(err: unknown): err is { message: string; status: number; code?: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string" &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  );
}

function looksLikeRoomAlreadyExists(err: unknown): boolean {
  if (isTwirpLike(err)) {
    const code = (err.code ?? "").toUpperCase();
    if (code.includes("EXISTS") || code.includes("DUPLICATE")) return true;
    if (err.status === 409) return true;
    if (/already exists|duplicate/i.test(err.message)) return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /already exists|duplicate/i.test(msg);
}

function formatDispatchFailureDetail(err: unknown): string {
  if (isTwirpLike(err)) {
    return `${err.code ?? "twirp"} (${err.status}): ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Cloud may briefly return empty/errors right after CreateRoom embeds `agents`; retry before deciding to call
 * createDispatch — otherwise we spawn **two** translator jobs (embedded dispatch + explicit createDispatch).
 */
async function listDispatchAgentNamesWithRetry(
  dispatchSvc: AgentDispatchClient,
  roomName: string,
): Promise<{ ok: true; names: string[] } | { ok: false }> {
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const existing = await dispatchSvc.listDispatch(roomName);
      const names = existing.map((d) => d.agentName);
      return { ok: true, names };
    } catch {
      await sleep(80 * Math.pow(2, attempt));
    }
  }
  return { ok: false };
}

/**
 * Ensures an agent job is tied to this room before the mobile client joins.
 * Creating the room via RoomService with `agents` is reliable on Cloud when the room does not exist yet.
 */
async function ensureRoomAndAgentDispatch(
  roomName: string,
  agentName: string,
  livekitUrl: string,
  apiKey: string,
  apiSecret: string,
): Promise<DispatchPath> {
  const host = livekitHttpHost(livekitUrl);
  const roomSvc = new RoomServiceClient(host, apiKey, apiSecret);
  const dispatchSvc = new AgentDispatchClient(host, apiKey, apiSecret);

  try {
    await roomSvc.createRoom({
      name: roomName,
      emptyTimeout: 600,
      agents: [new RoomAgentDispatch({ agentName })],
    });
    return "create_room_agents";
  } catch (e) {
    if (!looksLikeRoomAlreadyExists(e)) throw e;
  }

  let alreadyDispatched = false;
  const listed = await listDispatchAgentNamesWithRetry(dispatchSvc, roomName);
  if (listed.ok) {
    alreadyDispatched = listed.names.some((name) => name === agentName);
  } else {
    console.warn(
      `[livekit-token] listDispatch failed after retries for room=${roomName}; skipping explicit createDispatch to avoid duplicate agents`,
    );
    return "explicit_dispatch_skip_unverified_list";
  }

  if (!alreadyDispatched) {
    await dispatchSvc.createDispatch(roomName, agentName);
    return "explicit_dispatch";
  }

  return "explicit_dispatch_skip";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("LIVEKIT_API_KEY");
  const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  const livekitUrl = Deno.env.get("LIVEKIT_URL");
  const skipDispatch = Deno.env.get("LIVEKIT_SKIP_AGENT_DISPATCH") === "true";
  const agentName = Deno.env.get("LIVEKIT_AGENT_NAME") ?? "translator-agent";

  if (!apiKey || !apiSecret || !livekitUrl) {
    return new Response(JSON.stringify({ error: "Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const roomName = body.roomName?.trim();
  const participantName = body.participantName?.trim();

  if (!roomName || !participantName) {
    return new Response(JSON.stringify({ error: "roomName and participantName are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
    name: participantName,
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  if (!skipDispatch) {
    let dispatchPath: DispatchPath | undefined;
    try {
      dispatchPath = await ensureRoomAndAgentDispatch(roomName, agentName, livekitUrl, apiKey, apiSecret);
    } catch (e) {
      const detail = formatDispatchFailureDetail(e);
      return new Response(
        JSON.stringify({
          error:
            "LiveKit agent dispatch failed. Your worker may be registered, but Cloud still needs a room + dispatch for this session.",
          detail,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const jwt = await token.toJwt();

    return new Response(JSON.stringify({ token: jwt, url: livekitUrl, dispatchPath }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const jwt = await token.toJwt();

  return new Response(JSON.stringify({ token: jwt, url: livekitUrl }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
