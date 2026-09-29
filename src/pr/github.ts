import { spawn } from "node:child_process";
import type { CampaignConfig } from "../config.js";
import type { ExtractionCandidate } from "../analyzer/seam-finder.js";
import type { CampaignState } from "../orchestrator/campaign.js";

export interface PrResult {
  created: boolean;
  url?: string;
  body: string;
  dryRun: boolean;
}

export function buildPrBody(
  state: CampaignState,
  candidate: ExtractionCandidate
): string {
  return `## Summary
- Automated mono-cut extraction of \`${candidate.id}\` (\`${candidate.directory}\`)
- Campaign \`${state.id}\` on branch \`${state.workBranch}\`
- Attempts: ${state.attempt}; green checkpoint: \`${state.lastGreenCheckpoint ?? "n/a"}\`

## Files in candidate
${candidate.files.map((f) => `- ${f}`).join("\n")}

## Test plan
- [x] AST export/signature/caller/topology gates
- [x] \`${state.root}\` test suite
- [ ] Human review of facade/service boundary
`;
}

export async function createPullRequest(opts: {
  root: string;
  state: CampaignState;
  candidate: ExtractionCandidate;
  cfg: CampaignConfig;
}): Promise<PrResult> {
  const { state, candidate, cfg } = opts;
  const body = buildPrBody(state, candidate);
  const title = `mono-cut: extract ${candidate.id}`;

  if (cfg.dryRun || !cfg.createPr) {
    return { created: false, body, dryRun: true };
  }

  const result = await runGh([
    "pr",
    "create",
    "--title",
    title,
    "--body",
    body,
    "--head",
    state.workBranch,
  ], opts.root);

  if (result.code !== 0) {
    throw new Error(`gh pr create failed: ${result.stderr || result.stdout}`);
  }
  const url = result.stdout.trim().split("\n").pop();
  return { created: true, url, body, dryRun: false };
}

function runGh(
  args: string[],
  cwd: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("gh", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      reject(
        new Error(
          `gh not available (${(err as Error).message}). Use dryRun/createPr=false.`
        )
      );
    });
    child.on("close", (code) => {
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}
