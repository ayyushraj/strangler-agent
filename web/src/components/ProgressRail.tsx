import type { ProgressPhase } from "../api/client";

const STEPS: { id: ProgressPhase | "attempt"; label: string }[] = [
  { id: "cloning", label: "Clone" },
  { id: "indexing", label: "AST" },
  { id: "analyzing", label: "Analyze" },
  { id: "extracting", label: "Agent" },
  { id: "validating", label: "Validate" },
  { id: "ci", label: "CI" },
  { id: "pr", label: "PR" },
];

const ORDER: ProgressPhase[] = [
  "cloning",
  "indexing",
  "analyzing",
  "extracting",
  "validating",
  "ci",
  "pr",
  "green",
];

type Props = {
  phase: ProgressPhase | null;
  attempt: number;
  maxAttempts: number;
};

function phaseIndex(phase: ProgressPhase | null): number {
  if (!phase) return -1;
  if (phase === "green") return ORDER.length;
  if (phase === "rolled_back" || phase === "failed") return -2;
  return ORDER.indexOf(phase);
}

export function ProgressRail({ phase, attempt, maxAttempts }: Props) {
  const idx = phaseIndex(phase);
  const failed = phase === "rolled_back" || phase === "failed";

  return (
    <section className="mt-12 max-w-4xl">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
          Live progress
        </h2>
        <p className="font-mono text-xs text-ink/60">
          agent loop {attempt}/{maxAttempts}
          {phase ? ` · ${phase}` : ""}
        </p>
      </div>

      <ol className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {STEPS.map((step, i) => {
          const stepIdx = ORDER.indexOf(step.id as ProgressPhase);
          const done = !failed && idx > stepIdx;
          const active = !failed && idx === stepIdx;
          return (
            <li key={step.id} className="relative">
              <div
                className={[
                  "border px-2 py-3 text-center transition",
                  done
                    ? "border-moss bg-moss/15"
                    : active
                      ? "border-ink bg-paper animate-rail"
                      : "border-line/20 bg-paper/40 text-ink/45",
                  failed && active ? "border-rust bg-rust/10" : "",
                ].join(" ")}
              >
                <div className="font-mono text-[10px] uppercase tracking-wider">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="mt-1 text-sm font-semibold">{step.label}</div>
                {step.id === "extracting" && (active || done) && (
                  <div className="mt-1 font-mono text-[10px] text-ink/60">
                    {attempt}/{maxAttempts}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {failed && (
        <p className="mt-4 text-sm font-semibold text-rust">
          Campaign {phase}. Use rollback or reconnect and retry.
        </p>
      )}
      {phase === "green" && (
        <p className="mt-4 text-sm font-semibold text-moss">
          Gates green — PR body ready below.
        </p>
      )}
    </section>
  );
}
