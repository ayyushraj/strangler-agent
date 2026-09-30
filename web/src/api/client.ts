const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export type ProgressPhase =
  | "cloning"
  | "indexing"
  | "analyzing"
  | "extracting"
  | "validating"
  | "ci"
  | "pr"
  | "green"
  | "rolled_back"
  | "failed";

export type ProgressEvent =
  | { type: "phase"; phase: ProgressPhase }
  | { type: "attempt"; current: number; max: number }
  | { type: "log"; line: string }
  | { type: "candidates"; items: Candidate[] }
  | { type: "result"; ok: boolean; prBody?: string; prUrl?: string };

export interface Candidate {
  id: string;
  directory: string;
  riskScore: number;
  cohesion: number;
  coupling: number;
  files: string[];
  externalCallers: string[];
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? res.statusText);
  }
  return data as T;
}

export function createSession(body: {
  repoUrl?: string;
  localPath?: string;
  pat?: string;
  useDemo?: boolean;
}) {
  return json<{ sessionId: string; hasPat?: boolean; localPath?: string | null }>(
    "/api/sessions",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function startAnalyze(sessionId: string, localPath?: string) {
  return json<{ jobId: string }>("/api/jobs/analyze", {
    method: "POST",
    body: JSON.stringify({ sessionId, localPath }),
  });
}

export function startRun(body: {
  sessionId: string;
  candidateId?: string;
  backend?: "noop" | "cursor";
  createPr?: boolean;
  dryRun?: boolean;
}) {
  return json<{ jobId: string }>("/api/jobs/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function startRollback(jobId: string, sessionId: string) {
  return json<{ jobId: string }>(`/api/jobs/${jobId}/rollback`, {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export function getJob(jobId: string) {
  return json<{
    id: string;
    status: string;
    kind: string;
    error: string | null;
    result: unknown;
    campaign: {
      id: string;
      state: string;
      attempt: number;
      candidateId: string | null;
      workBranch: string;
    } | null;
  }>(`/api/jobs/${jobId}`);
}

export function subscribeJobEvents(
  jobId: string,
  onEvent: (event: ProgressEvent) => void,
  onError?: (err: Event) => void
): () => void {
  const url = `${API_BASE}/api/jobs/${jobId}/events`;
  const es = new EventSource(url);
  let closed = false;
  es.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data) as ProgressEvent;
      onEvent(event);
      if (event.type === "result") {
        closed = true;
        es.close();
      }
    } catch {
      /* ignore malformed */
    }
  };
  es.onerror = (err) => {
    if (closed) return;
    onError?.(err);
    // Stop infinite browser reconnect loops once the job is gone/errored
    if (es.readyState === EventSource.CLOSED) return;
    // After a burst of errors, close — caller can poll status
    es.close();
    closed = true;
  };
  return () => {
    closed = true;
    es.close();
  };
}

export async function health() {
  return json<{ ok: boolean; cursorKeyPresent: boolean }>("/api/health");
}
