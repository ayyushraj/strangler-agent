import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { CampaignConfig } from "../config.js";
import { resolveAstContextBin } from "../config.js";
import { IndexReader } from "./index-reader.js";
import { findSeams, type ExtractionCandidate } from "./seam-finder.js";

export type { ExtractionCandidate } from "./seam-finder.js";
export { findSeams } from "./seam-finder.js";

export interface AnalysisResult {
  root: string;
  candidates: ExtractionCandidate[];
  recommended: ExtractionCandidate | null;
}

export async function ensureIndex(
  root: string,
  cfg: CampaignConfig
): Promise<void> {
  const bin = resolveAstContextBin(cfg);
  const abs = resolve(root);
  await runShell(`${bin} index ${shellQuote(abs)}`);
}

export async function analyzeRepo(
  root: string,
  cfg: CampaignConfig
): Promise<AnalysisResult> {
  await ensureIndex(root, cfg);
  const reader = IndexReader.open(root);
  try {
    const candidates = findSeams(reader);
    const recommended =
      candidates.find((c) => c.directory.includes("inventory")) ??
      candidates[0] ??
      null;
    return { root: resolve(root), candidates, recommended };
  } finally {
    reader.close();
  }
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function runShell(command: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`index failed (${code}): ${stderr || command}`));
    });
  });
}
