import { useEffect, useRef } from "react";

type Props = {
  lines: string[];
};

export function LogStream({ lines }: Props) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <section className="mt-12 max-w-4xl">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
          Live logs
        </h2>
        <p className="font-mono text-xs text-ink/50">{lines.length} lines</p>
      </div>
      <div
        ref={scroller}
        className="mt-4 max-h-72 overflow-auto border border-line/25 bg-ink px-4 py-3 font-mono text-[12px] leading-5 text-[#d6e0d4]"
      >
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
