export interface AgentSendResult {
  status: "ok" | "error";
  text: string;
}

export interface AgentSession {
  id: string;
  send(prompt: string): Promise<AgentSendResult>;
  dispose(): Promise<void>;
}

export interface AgentSessionOptions {
  cwd: string;
  model?: string;
  mcpServers?: Record<string, unknown>;
  /** Extra context for noop scripted extraction */
  candidateId?: string;
  root?: string;
}

export interface AgentBackend {
  id: string;
  createSession(opts: AgentSessionOptions): Promise<AgentSession>;
}
