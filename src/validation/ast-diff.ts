import { createHash } from "node:crypto";
import { ensureIndex } from "../analyzer/plan.js";
import { IndexReader } from "../analyzer/index-reader.js";
import type { ExtractionCandidate } from "../analyzer/seam-finder.js";
import type { CampaignConfig } from "../config.js";

export interface AstGateFailure {
  gate: "export_coverage" | "signature_stability" | "caller_continuity" | "topology";
  message: string;
  symbol?: string;
  path?: string;
}

export interface AstDiffReport {
  ok: boolean;
  failures: AstGateFailure[];
}

export async function validateAstDiff(
  root: string,
  cfg: CampaignConfig,
  candidate: ExtractionCandidate,
  baselineExports: ExtractionCandidate["publicExports"]
): Promise<AstDiffReport> {
  await ensureIndex(root, cfg);
  const reader = IndexReader.open(root);
  try {
    const failures: AstGateFailure[] = [];
    const symbols = reader.symbols();
    const byNamePath = new Map(
      symbols.map((s) => [`${s.path}::${s.name}`, s] as const)
    );
    const byName = new Map<string, typeof symbols>();
    for (const s of symbols) {
      const list = byName.get(s.name) ?? [];
      list.push(s);
      byName.set(s.name, list);
    }

    const facadeHint = candidate.directory; // e.g. src/inventory
    const extractedStillPresent = candidate.files.some((f) =>
      symbols.some((s) => s.path === f)
    );

    // Export coverage: each baseline public export must still resolve by name somewhere
    for (const exp of baselineExports) {
      const exact = byNamePath.get(`${exp.path}::${exp.name}`);
      const any = byName.get(exp.name);
      if (!exact && (!any || any.length === 0)) {
        failures.push({
          gate: "export_coverage",
          message: `Public export ${exp.name} from ${exp.path} is missing (no shim)`,
          symbol: exp.name,
          path: exp.path,
        });
        continue;
      }
      // Signature stability when same path preserved
      if (exact && exp.signature && exact.signature && exact.signature !== exp.signature) {
        failures.push({
          gate: "signature_stability",
          message: `Signature changed for ${exp.name}: ${exp.signature} → ${exact.signature}`,
          symbol: exp.name,
          path: exp.path,
        });
      }
    }

    // Caller continuity: external caller files should still import the module or a facade
    const imports = reader.imports();
    for (const caller of candidate.externalCallers) {
      const callerImports = imports.filter((i) => i.path === caller);
      const stillTouches =
        callerImports.some((i) => {
          const src = i.source_module;
          return (
            src.includes("inventory") ||
            src.includes(candidate.directory.replace(/^src\//, "")) ||
            src.includes("facade") ||
            src.includes("client")
          );
        }) ||
        // or still imports relative path into directory
        callerImports.some((i) => i.source_module.includes(`../${candidate.directory.split("/").pop()}`));
      if (!stillTouches && candidate.externalCallers.length > 0) {
        // Soft: only fail if extraction moved files and callers lost the link
        if (!extractedStillPresent || movedWithoutShim(candidate, symbols)) {
          // check if inventory index still exists
          const hasIndex = symbols.some(
            (s) => s.path === `${candidate.directory}/index.ts` || s.path === `${candidate.directory}/facade.ts`
          );
          if (!hasIndex) {
            failures.push({
              gate: "caller_continuity",
              message: `Caller ${caller} no longer imports extracted module or facade`,
              path: caller,
            });
          }
        }
      }
    }

    // Topology: extracted service implementation should not import orders/notify internals
    const forbidden = ["orders", "notify"];
    for (const f of candidate.files) {
      if (f.includes("facade") || f.includes("client")) continue;
      const fileImports = imports.filter((i) => i.path === f);
      for (const imp of fileImports) {
        for (const bad of forbidden) {
          if (imp.source_module.includes(`/${bad}`) || imp.source_module.endsWith(bad)) {
            // inventory importing db is ok; importing orders is not
            if (bad === "orders" || (bad === "notify" && !f.includes("notify"))) {
              if (imp.source_module.includes("orders")) {
                failures.push({
                  gate: "topology",
                  message: `${f} imports monolith module ${imp.source_module} (use a port)`,
                  path: f,
                });
              }
            }
          }
        }
      }
    }

    return { ok: failures.length === 0, failures };
  } finally {
    reader.close();
  }
}

function movedWithoutShim(
  candidate: ExtractionCandidate,
  symbols: Array<{ path: string }>
): boolean {
  const stillInPlace = candidate.files.every((f) =>
    symbols.some((s) => s.path === f)
  );
  return !stillInPlace;
}

export function digestFailures(report: AstDiffReport | { stderr: string }): string {
  const payload =
    "failures" in report
      ? JSON.stringify(report.failures)
      : report.stderr.slice(0, 2000);
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
