import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

import { supabaseFunctionsInvokeRegion } from '@/lib/config';
import { supabase } from '@/lib/supabase';

export type LiveKitTokenResponse = {
  token: string;
  url: string;
  /** Set by Edge Function when agent dispatch runs (helps verify deployed code). */
  dispatchPath?:
    | 'create_room_agents'
    | 'explicit_dispatch'
    | 'explicit_dispatch_skip'
    | 'explicit_dispatch_skip_unverified_list';
};

/** Cold Edge start + LiveKit Twirp inside the function can exceed default patience on cellular. */
const INVOKE_TIMEOUT_MS = 90_000;

const MAX_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attemptIndex: number): number {
  const base = 450 * 2 ** attemptIndex;
  const jitter = Math.floor(Math.random() * 320);
  return base + jitter;
}

function isRetriableInvokeError(error: unknown): boolean {
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) return true;
  if (error instanceof FunctionsHttpError) {
    const status = typeof error.context?.status === 'number' ? error.context.status : 0;
    if (status === 408 || status === 425 || status === 429) return true;
    if (status >= 502 && status <= 504) return true;
  }
  return false;
}

async function formatInvokeFailure(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const res = error.context as Response;
      const ct = res.headers.get('Content-Type') ?? '';
      if (ct.includes('application/json')) {
        const j = (await res.clone().json()) as { error?: unknown; detail?: unknown };
        if (typeof j.error === 'string') {
          const detail = typeof j.detail === 'string' ? `: ${j.detail}` : '';
          return `${j.error}${detail}`;
        }
      }
    } catch {
      /* fall through */
    }
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function mintLiveKitToken(roomName: string, participantName: string): Promise<LiveKitTokenResponse> {
  const region = supabaseFunctionsInvokeRegion();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.functions.invoke<LiveKitTokenResponse>('livekit-token', {
      body: { roomName, participantName },
      timeout: INVOKE_TIMEOUT_MS,
      ...(region ? { region } : {}),
    });

    if (!error && data?.token && data?.url) {
      if (__DEV__ && data.dispatchPath) {
        console.log('[Voisa] livekit-token dispatchPath:', data.dispatchPath);
      }
      return data;
    }

    if (!error) {
      throw new Error('livekit-token returned an invalid payload');
    }

    lastError = error;

    const retriable = isRetriableInvokeError(error);
    if (!retriable || attempt === MAX_ATTEMPTS - 1) {
      throw new Error(await formatInvokeFailure(error));
    }

    await sleep(backoffMs(attempt));
  }

  throw new Error(await formatInvokeFailure(lastError));
}
