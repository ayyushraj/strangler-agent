type Props = {
  lines: string[];
};

export function LogStream({ lines }: Props) {
  return (
    <section className="mt-12 max-w-4xl">
      <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
        Live logs
      </h2>
      <div className="mt-4 max-h-72 overflow-auto border border-line/25 bg-ink px-4 py-3 font-mono text-[12px] leading-5 text-[#d6e0d4]">
        {lines.length === 0 ? (
          <p className="text-white/40">Waiting for job events…</p>
        ) : (
          lines.map((line, i) => (
            <div key={`${i}-${line.slice(0, 24)}`} className="animate-log">
              <span className="text-white/35">{String(i + 1).padStart(3, "0")}</span>{" "}
              {line}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
