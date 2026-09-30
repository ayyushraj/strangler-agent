import { useEffect, useRef, useState } from "react";
import {
  createSession,
  getJob,
  health,
  startAnalyze,
  startRollback,
  startRun,
  subscribeJobEvents,
  type Candidate,
  type ProgressEvent,
  type ProgressPhase,
} from "../api/client";
import {
  loadRepoUrl,
  loadSessionId,
  saveRepoUrl,
  saveSessionId,
} from "../state/session";
import { RepoForm } from "../components/RepoForm";
import { ActionBar } from "../components/ActionBar";
import { ProgressRail } from "../components/ProgressRail";
import { LogStream } from "../components/LogStream";

export function Dashboard() {
  const [repoUrl, setRepoUrl] = useState(loadRepoUrl);
  const [isPrivate, setPrivate] = useState(false);
  const [pat, setPat] = useState("");
  const patRef = useRef("");
  const [sessionId, setSessionId] = useState<string | null>(loadSessionId);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<ProgressPhase | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [logs, setLogs] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [prBody, setPrBody] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [backend, setBackend] = useState<"noop" | "cursor">("noop");
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    patRef.current = pat;
  }, [pat]);

  useEffect(() => {
    health()
      .then((h) => {
        setServerOk(h.ok);
        if (h.cursorKeyPresent) setBackend("cursor");
      })
      .catch(() => setServerOk(false));
    return () => unsubRef.current?.();
  }, []);

  function appendLog(line: string) {
    setLogs((prev) => [...prev.slice(-400), line]);
  }

  function handleEvent(event: ProgressEvent) {
    if (event.type === "phase") setPhase(event.phase);
    if (event.type === "attempt") {
      setAttempt(event.current);
      setMaxAttempts(event.max);
    }
    if (event.type === "log") appendLog(event.line);
    if (event.type === "candidates") {
      setCandidates(event.items);
      if (event.items[0] && !selected) setSelected(event.items[0].id);
    }
    if (event.type === "result") {
      setBusy(false);
      if (event.prBody) setPrBody(event.prBody);
      if (event.prUrl) setPrUrl(event.prUrl);
      if (!event.ok) appendLog("Job finished without green gate");
    }
  }

  function watchJob(id: string) {
    unsubRef.current?.();
    unsubRef.current = subscribeJobEvents(id, handleEvent, () => {
      // fallback poll if SSE drops
      void getJob(id).then((j) => {
        if (j.status === "done" || j.status === "error") setBusy(false);
        if (j.error) setError(j.error);
      });
    });
  }

  async function onConnect() {
    setError(null);
    setBusy(true);
    try {
      saveRepoUrl(repoUrl.trim());
      const res = await createSession({
        repoUrl: repoUrl.trim(),
        pat: isPrivate ? patRef.current || undefined : undefined,
      });
      saveSessionId(res.sessionId);
      setSessionId(res.sessionId);
      appendLog(`Session ${res.sessionId.slice(0, 8)}… connected`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onUseDemo() {
    setError(null);
    setBusy(true);
    try {
      const res = await createSession({ useDemo: true });
      saveSessionId(res.sessionId);
      setSessionId(res.sessionId);
      setRepoUrl("(demo fixture)");
      appendLog("Connected to fixtures/demo-monolith");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onAnalyze() {
    if (!sessionId || busy) return;
    setError(null);
    setBusy(true);
    setPrBody(null);
    setCandidates([]);
    setSelected("");
    setLogs([]);
    setPhase(null);
    try {
      const { jobId: id } = await startAnalyze(sessionId);
      setJobId(id);
      watchJob(id);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onRun() {
    if (!sessionId || busy) return;
    if (candidates.length === 0 && !selected) {
      setError(
        "No candidates yet. Click Analyze Workspace first — this repo may use nested folders (backend/, src/, …)."
      );
      return;
    }
    setError(null);
    setBusy(true);
    setPrBody(null);
    setLogs([]);
    setPhase(null);
    setAttempt(0);
    try {
      const { jobId: id } = await startRun({
        sessionId,
        candidateId: selected || undefined,
        backend,
        dryRun: true,
        createPr: false,
      });
      setJobId(id);
      watchJob(id);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onRollback() {
    if (!sessionId || !jobId) return;
    setError(null);
    setBusy(true);
    try {
      const { jobId: id } = await startRollback(jobId, sessionId);
      setJobId(id);
      watchJob(id);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 pb-24 pt-14 sm:px-10">
      <header className="max-w-3xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss">
          local zero-trust runner
        </p>
        <h1 className="font-display mt-3 text-5xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
          strangler-agent
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink/75">
          Peel a seam from a monolith with button-driven analyze, extract, and
          rollback — PATs and code stay on this machine.
        </p>
        <p className="mt-3 font-mono text-xs text-ink/50">
          API{" "}
          {serverOk === null
            ? "checking…"
            : serverOk
              ? "127.0.0.1:8787 · online"
              : "offline — run npm run dev:server"}
        </p>
      </header>

      <RepoForm
        repoUrl={repoUrl}
        pat={pat}
        isPrivate={isPrivate}
        connected={Boolean(sessionId)}
        busy={busy}
        onRepoUrl={setRepoUrl}
        onPat={setPat}
        onPrivate={setPrivate}
        onConnect={onConnect}
        onUseDemo={onUseDemo}
      />

      {error && (
        <p className="mt-6 max-w-2xl border border-rust/40 bg-rust/10 px-3 py-2 text-sm text-rust">
          {error}
        </p>
      )}

      <ActionBar
        connected={Boolean(sessionId)}
        busy={busy}
        hasJob={Boolean(jobId)}
        canRun={candidates.length > 0}
        backend={backend}
        onBackend={setBackend}
        onAnalyze={onAnalyze}
        onRun={onRun}
        onRollback={onRollback}
      />

      <ProgressRail phase={phase} attempt={attempt} maxAttempts={maxAttempts} />
      <LogStream lines={logs} />

      {candidates.length > 0 && (
        <section className="mt-12 max-w-3xl">
          <h2 className="font-display text-2xl font-medium text-ink">
            Extraction candidates
          </h2>
          <ul className="mt-4 space-y-2">
            {candidates.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-start gap-3 border border-line/20 bg-paper/50 px-3 py-3 hover:border-line/40">
                  <input
                    type="radio"
                    name="candidate"
                    checked={selected === c.id}
                    onChange={() => setSelected(c.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-mono text-sm font-semibold">{c.id}</span>
                    <span className="mt-1 block text-sm text-ink/65">
                      {c.directory} · risk {c.riskScore.toFixed(1)} · coupling{" "}
                      {c.coupling} · {c.files.length} files
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {prBody && (
        <section className="mt-12 max-w-3xl">
          <h2 className="font-display text-2xl font-medium text-ink">
            PR preview
          </h2>
          {prUrl && (
            <a
              className="mt-2 inline-block font-mono text-sm text-moss underline"
              href={prUrl}
              target="_blank"
              rel="noreferrer"
            >
              {prUrl}
            </a>
          )}
          <pre className="mt-4 overflow-auto border border-line/25 bg-paper/70 p-4 font-mono text-xs leading-5 whitespace-pre-wrap">
            {prBody}
          </pre>
        </section>
      )}
    </div>
  );
}
