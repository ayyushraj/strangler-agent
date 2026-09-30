import type { Candidate } from "../api/client";

type Props = {
  candidates: Candidate[];
  selected: string;
  onSelect: (id: string) => void;
};

export function CandidateList({ candidates, selected, onSelect }: Props) {
  if (candidates.length === 0) return null;

  const scores = candidates.map((c) => c.riskScore);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;

  return (
    <section className="mt-12 max-w-3xl">
      <h2 className="font-display text-2xl font-medium text-ink">
        Extraction candidates
      </h2>
      <p className="mt-1 text-sm text-ink/60">
        Lowest risk is preselected. Pick the seam to extract.
      </p>
      <ul className="mt-4 space-y-2">
        {candidates.map((c, i) => {
          const risk = (c.riskScore - min) / span;
          const active = selected === c.id;
          return (
            <li key={c.id}>
              <label
                className={[
                  "flex cursor-pointer items-start gap-3 border px-3 py-3 transition",
                  active
                    ? "border-moss bg-moss/10"
                    : "border-line/20 bg-paper/50 hover:border-line/40",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="candidate"
                  checked={active}
                  onChange={() => onSelect(c.id)}
                  className="mt-1 accent-[#3d5a45]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{c.id}</span>
                    {i === 0 && (
                      <span className="border border-moss/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-moss">
                        recommended
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-sm text-ink/65">
                    {c.directory} · coupling {c.coupling} · {c.files.length} files
                  </span>
                  <span className="mt-2 flex items-center gap-2">
                    <span className="h-1 w-28 bg-line/15">
                      <span
                        className="block h-1 bg-rust/80"
                        style={{ width: `${Math.round(18 + risk * 82)}%` }}
                      />
                    </span>
                    <span className="font-mono text-[10px] text-ink/50">
                      risk {c.riskScore.toFixed(1)}
                    </span>
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
