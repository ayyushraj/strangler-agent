import type { ProgressPhase } from "../api/client";

const STEPS: { id: ProgressPhase; label: string }[] = [
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
  const doneCount = failed ? 0 : Math.max(0, Math.min(idx, STEPS.length));
  const fill = failed
    ? 0
    : phase === "green"
      ? 100
      : (doneCount / (STEPS.length - 1)) * 100;

  return (
    <section className="mt-12 max-w-4xl">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
          Live progress
        </h2>
        <p className="font-mono text-xs text-ink/60">
          agent loop {attempt}/{maxAttempts}
          {phase ? ` · ${phase.replaceAll("_", " ")}` : ""}
        </p>
      </div>

      <div className="relative mt-8 overflow-x-auto pb-2">
        <div className="relative min-w-[36rem]">
          <div className="absolute left-[7%] right-[7%] top-[11px] h-px bg-line/20" />
          <div
            className="absolute left-[7%] top-[11px] h-px bg-moss transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(0, Math.min(86, (fill / 100) * 86))}%` }}
          />
          <ol className="relative grid grid-cols-7">
            {STEPS.map((step, i) => {
              const done = !failed && (phase === "green" || idx > i);
              const active = !failed && idx === i;
              const markFail = failed && i === Math.max(0, attempt > 0 ? 3 : 0);
              return (
                <li key={step.id} className="flex flex-col items-center text-center">
                  <span
                    className={[
                      "relative z-10 grid h-6 w-6 place-items-center rounded-full border text-[10px] font-semibold",
                      done
                        ? "border-moss bg-moss text-paper"
                        : active
                          ? "border-ink bg-paper text-ink shadow-[0_0_0_4px_rgba(26,28,25,0.08)]"
                          : markFail
                            ? "border-rust bg-rust text-paper"
                            : "border-line/25 bg-paper text-ink/40",
                    ].join(" ")}
                  >
                    {done ? "✓" : String(i + 1)}
                  </span>
                  <span
                    className={[
                      "mt-2 text-xs font-semibold",
                      done || active ? "text-ink" : "text-ink/40",
                    ].join(" ")}
                  >
                    {step.label}
                  </span>
                  {step.id === "extracting" && (
                    <span className="mt-1 font-mono text-[10px] text-ink/50">
                      {attempt}/{maxAttempts}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {failed && (
        <p className="mt-4 text-sm font-semibold text-rust">
          Campaign {phase?.replaceAll("_", " ")}. Use rollback or reconnect and retry.
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
