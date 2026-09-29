import type { AgentBackend } from "./types.js";
import { CursorSdkBackend } from "./cursor-sdk.js";
import { NoopBackend } from "./noop.js";

export function getBackend(name: "cursor" | "noop"): AgentBackend {
  if (name === "cursor") return new CursorSdkBackend();
  return new NoopBackend();
}

export type { AgentBackend, AgentSession } from "./types.js";
export { CursorSdkBackend } from "./cursor-sdk.js";
export { NoopBackend } from "./noop.js";
