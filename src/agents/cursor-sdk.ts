import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentBackend, AgentSession, AgentSessionOptions } from "./types.js";

function defaultAstContextMcp(cwd: string): Record<string, unknown> {
  const sibling = resolve(
    import.meta.dirname,
    "../../../ast-context/dist/cli.js"
  );
  const command = existsSync(sibling) ? "node" : "npx";
  const args = existsSync(sibling)
    ? [sibling, "serve", "--root", cwd]
    : ["ast-context", "serve", "--root", cwd];
  return {
    "ast-context": {
      command,
      args,
    },
  };
}

/**
 * Cursor SDK backend. Requires CURSOR_API_KEY.
 * MCP servers are passed on create (and must be re-passed on resume).
 */
export class CursorSdkBackend implements AgentBackend {
  id = "cursor";

  async createSession(opts: AgentSessionOptions): Promise<AgentSession> {
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) {
      throw new Error("CURSOR_API_KEY is required for backend=cursor");
    }

    let Agent: typeof import("@cursor/sdk").Agent;
    let CursorAgentError: typeof import("@cursor/sdk").CursorAgentError;
    try {
      const mod = await import("@cursor/sdk");
      Agent = mod.Agent;
      CursorAgentError = mod.CursorAgentError;
    } catch {
      throw new Error(
        "@cursor/sdk is not installed. Run: npm install @cursor/sdk"
      );
    }
    const cwd = resolve(opts.cwd);
    const mcpServers = opts.mcpServers ?? defaultAstContextMcp(cwd);

    const agent = await Agent.create({
      apiKey,
      model: { id: opts.model ?? "composer-2.5" },
      local: { cwd },
      mcpServers,
    } as Parameters<typeof Agent.create>[0]);

    const id =
      (agent as { agentId?: string }).agentId ??
      (agent as { id?: string }).id ??
      `cursor-${Date.now()}`;

    return {
      id: String(id),
      async send(prompt: string) {
        try {
          const run = await agent.send(prompt);
          const result = await run.wait();
          if (result.status === "error") {
            return { status: "error", text: `run failed: ${result.id ?? ""}` };
          }
          const text =
            (result as { result?: string }).result ??
            (result as { text?: string }).text ??
            JSON.stringify(result);
          return { status: "ok", text: String(text) };
        } catch (err) {
          if (err instanceof CursorAgentError) {
            return {
              status: "error",
              text: `startup failed: ${err.message}`,
            };
          }
          throw err;
        }
      },
      async dispose() {
        const disposable = agent as unknown as {
          [Symbol.asyncDispose]?: () => Promise<void> | void;
          close?: () => Promise<void> | void;
        };
        const asyncDispose = disposable[Symbol.asyncDispose];
        if (typeof asyncDispose === "function") {
          await asyncDispose.call(disposable);
          return;
        }
        if (typeof disposable.close === "function") {
          await disposable.close();
        }
      },
    };
  }
}
