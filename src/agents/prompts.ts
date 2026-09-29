import type { ExtractionCandidate } from "../analyzer/seam-finder.js";
import type { AstDiffReport } from "../validation/ast-diff.js";

export function buildExtractPrompt(
  candidate: ExtractionCandidate,
  root: string
): string {
  return `You are extracting an isolated module from a monolith into a microservice boundary.

Repository root: ${root}
Candidate id: ${candidate.id}
Directory: ${candidate.directory}
Files:
${candidate.files.map((f) => `- ${f}`).join("\n")}

Public exports to preserve (shim if moved):
${candidate.publicExports.map((e) => `- ${e.name} (${e.path}) ${e.signature ?? ""}`).join("\n")}

External callers:
${candidate.externalCallers.map((c) => `- ${c}`).join("\n") || "(none)"}

Requirements:
1. Move implementation into a clear service boundary (e.g. services/inventory or keep under ${candidate.directory} with a port for db).
2. Leave a thin facade/client at the original import path so existing callers keep compiling.
3. Do NOT delete public exports — re-export from the facade if needed.
4. Extracted code must not import orders/notify internals; depend on ports/interfaces for shared db access.
5. Keep existing tests passing without rewriting business logic behavior.
6. Use ast-context MCP tools (find_symbol, get_callers, list_file_symbols) before editing.

When done, briefly summarize files changed.`;
}

export function buildFixFromAstPrompt(
  report: AstDiffReport,
  candidate: ExtractionCandidate
): string {
  return `AST validation gates failed for candidate ${candidate.id}. Fix the code so gates pass.

Failures (JSON):
${JSON.stringify(report.failures, null, 2)}

Rules: preserve public exports via shims, keep signatures stable, restore caller imports to facade/client, avoid illegal topology edges.
Do not open a PR. Make the minimal fix.`;
}

export function buildFixFromTestPrompt(
  failureText: string,
  candidate: ExtractionCandidate
): string {
  return `Tests failed after extracting candidate ${candidate.id}. Fix the failures using the stack trace below. Preserve business behavior.

${failureText}

Make the minimal fix. Re-run reasoning with ast-context if needed. Do not open a PR.`;
}
