import { resolve } from "node:path";
import type { CampaignConfig } from "../config.js";
import { analyzeRepo } from "../analyzer/plan.js";
import type { ExtractionCandidate } from "../analyzer/seam-finder.js";
import { getBackend } from "../agents/index.js";
import {
  appendEvent,
  createCampaign,
  loadCampaign,
  saveCampaign,
  setState,
  type CampaignState,
} from "./campaign.js";
import { createWorkBranch } from "../safety/checkpoint.js";
import { runValidationLoop } from "../validation/loop.js";
import { createPullRequest } from "../pr/github.js";

export interface PipelineResult {
  state: CampaignState;
  ok: boolean;
  prUrl?: string;
  prBody?: string;
}

export async function runPipeline(
  root: string,
  cfg: CampaignConfig
): Promise<PipelineResult> {
  const abs = resolve(root);
  let state = loadCampaign(abs) ?? createCampaign(abs, cfg);

  // Analyze
  const analysis = await analyzeRepo(abs, cfg);
  setState(state, "indexed");
  appendEvent(abs, {
    type: "analyzed",
    candidates: analysis.candidates.map((c) => ({
      id: c.id,
      risk: c.riskScore,
    })),
  });

  let candidate: ExtractionCandidate | null = null;
  if (cfg.candidateId) {
    candidate =
      analysis.candidates.find((c) => c.id === cfg.candidateId) ?? null;
  }
  candidate = candidate ?? analysis.recommended;
  if (!candidate) {
    setState(state, "failed");
    throw new Error("No extraction candidates found");
  }

  state.candidateId = candidate.id;
  state.candidate = candidate;
  setState(state, "planned");
  saveCampaign(state);

  // Git work branch
  const base = await createWorkBranch(abs, state.workBranch);
  state.baseRef = base;
  saveCampaign(state);

  const backend = getBackend(cfg.backend);
  const session = await backend.createSession({
    cwd: abs,
    model: cfg.model,
    candidateId: candidate.id,
    root: abs,
  });
  state.agentSessionId = session.id;
  saveCampaign(state);

  try {
    const loop = await runValidationLoop({
      state,
      cfg,
      candidate,
      session,
    });
    if (!loop.ok) {
      return { state: loop.state, ok: false };
    }

    const pr = await createPullRequest({
      root: abs,
      state: loop.state,
      candidate,
      cfg,
    });
    if (pr.created) {
      setState(loop.state, "pr_opened");
    }
    return {
      state: loop.state,
      ok: true,
      prUrl: pr.url,
      prBody: pr.body,
    };
  } finally {
    await session.dispose();
  }
}

export async function runAnalyzeOnly(root: string, cfg: CampaignConfig) {
  const abs = resolve(root);
  const state = loadCampaign(abs) ?? createCampaign(abs, cfg);
  const analysis = await analyzeRepo(abs, cfg);
  setState(state, "indexed");
  return { state, analysis };
}
