type Props = {
  connected: boolean;
  busy: boolean;
  hasJob: boolean;
  canRun: boolean;
  backend: "noop" | "cursor";
  onBackend: (b: "noop" | "cursor") => void;
  onAnalyze: () => void;
  onRun: () => void;
  onRollback: () => void;
};

export function ActionBar(props: Props) {
  return (
    <section className="mt-12 max-w-3xl">
      <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
        Campaign actions
      </h2>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="pressable border border-line bg-moss px-4 py-2.5 text-sm font-semibold text-paper transition hover:brightness-110 disabled:opacity-40"
          disabled={!props.connected || props.busy}
          onClick={props.onAnalyze}
        >
          {props.busy ? "Working…" : "Analyze workspace"}
        </button>
        <button
          type="button"
          className="pressable border border-line bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition hover:bg-moss disabled:opacity-40"
          disabled={!props.connected || props.busy || !props.canRun}
          onClick={props.onRun}
        >
          {props.busy ? "Working…" : "Run extraction"}
        </button>
        <button
          type="button"
          className="pressable border border-rust/50 bg-transparent px-4 py-2.5 text-sm font-semibold text-rust transition hover:bg-rust/10 disabled:opacity-40"
          disabled={!props.hasJob || props.busy}
          onClick={props.onRollback}
        >
          {props.busy ? "Working…" : "Manual git rollback"}
        </button>

        <label className="ml-auto flex items-center gap-2 text-sm text-ink/70">
          Backend
          <select
            className="border border-line/30 bg-paper/80 px-2 py-1.5 font-mono text-xs"
            value={props.backend}
            onChange={(e) =>
              props.onBackend(e.target.value as "noop" | "cursor")
            }
            disabled={props.busy}
          >
            <option value="noop">noop</option>
            <option value="cursor">cursor</option>
          </select>
        </label>
      </div>
    </section>
  );
}
