/**
 * Ambient stubs for editors that run the workspace TypeScript server on Edge Functions.
 * Runtime uses Deno + `npm:livekit-server-sdk@…` on Supabase; see `deno.json` and `.vscode/settings.json`.
 */

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };

  function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "npm:livekit-server-sdk@2.15.3" {
  export class AccessToken {
    constructor(apiKey: string, apiSecret: string, opts?: { identity?: string; name?: string });
    addGrant(grant: Record<string, unknown>): void;
    toJwt(): Promise<string>;
  }

  export class AgentDispatchClient {
    constructor(host: string, apiKey?: string, secret?: string);
    createDispatch(roomName: string, agentName: string, options?: Record<string, unknown>): Promise<unknown>;
    listDispatch(roomName: string): Promise<Array<{ agentName: string }>>;
  }

  export class RoomServiceClient {
    constructor(host: string, apiKey?: string, secret?: string);
    createRoom(options: Record<string, unknown>): Promise<unknown>;
  }

  export class RoomAgentDispatch {
    constructor(opts: { agentName: string; metadata?: string });
  }
}
