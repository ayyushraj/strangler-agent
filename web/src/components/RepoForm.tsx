type Props = {
  repoUrl: string;
  pat: string;
  isPrivate: boolean;
  connected: boolean;
  busy: boolean;
  onRepoUrl: (v: string) => void;
  onPat: (v: string) => void;
  onPrivate: (v: boolean) => void;
  onConnect: () => void;
  onUseDemo: () => void;
};

export function RepoForm(props: Props) {
  return (
    <section className="mt-10 max-w-2xl">
      <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
        Target repository
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink/70">
        Public clones need no token. For private repos, paste a GitHub PAT — it
        stays in memory on this machine only.
      </p>

      <label className="mt-6 block text-sm font-semibold text-ink/80">
        Repo URL
        <input
          className="mt-2 w-full border border-line/25 bg-paper/70 px-3 py-2.5 font-mono text-sm outline-none ring-moss/40 focus:ring-2"
          placeholder="https://github.com/org/monolith"
          value={props.repoUrl}
          onChange={(e) => props.onRepoUrl(e.target.value)}
          disabled={props.busy}
        />
      </label>

      <label className="mt-4 flex items-center gap-2 text-sm text-ink/80">
        <input
          type="checkbox"
          checked={props.isPrivate}
          onChange={(e) => props.onPrivate(e.target.checked)}
          disabled={props.busy}
        />
        Private repo (ask for PAT)
      </label>

      {props.isPrivate && (
        <label className="mt-3 block text-sm font-semibold text-ink/80">
          Personal access token
          <input
            type="password"
            autoComplete="off"
            className="mt-2 w-full border border-line/25 bg-paper/70 px-3 py-2.5 font-mono text-sm outline-none ring-moss/40 focus:ring-2"
            placeholder="ghp_…"
            value={props.pat}
            onChange={(e) => props.onPat(e.target.value)}
            disabled={props.busy}
          />
        </label>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          className="pressable border border-line bg-ink px-4 py-2 text-sm font-semibold text-paper transition hover:bg-moss disabled:opacity-40"
          onClick={props.onConnect}
          disabled={props.busy || !props.repoUrl.trim()}
        >
          {props.connected ? "Reconnect" : "Connect"}
        </button>
        <button
          type="button"
          className="pressable border border-line/40 bg-transparent px-4 py-2 text-sm font-semibold text-ink transition hover:border-line hover:bg-paper/50 disabled:opacity-40"
          onClick={props.onUseDemo}
          disabled={props.busy}
        >
          Use demo fixture
        </button>
      </div>
    </section>
  );
}
