import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  campaignStatePath,
  eventsPath,
  monoCutDir,
  type CampaignConfig,
} from "../config.js";
import type { ExtractionCandidate } from "../analyzer/seam-finder.js";

export type CampaignStateName =
  | "initialized"
  | "indexed"
  | "planned"
  | "extracting"
  | "validating"
  | "green"
  | "pr_opened"
  | "rolled_back"
  | "failed";

export interface CampaignState {
  id: string;
  root: string;
  state: CampaignStateName;
  baseRef: string | null;
  workBranch: string;
  candidateId: string | null;
  candidate: ExtractionCandidate | null;
  attempt: number;
  lastGreenCheckpoint: string | null;
  lastCheckpoint: string | null;
  agentSessionId: string | null;
  lastFailureDigest: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createCampaign(root: string, _cfg: CampaignConfig): CampaignState {
  const abs = resolve(root);
  mkdirSync(monoCutDir(abs), { recursive: true });
  const id = randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const state: CampaignState = {
    id,
    root: abs,
    state: "initialized",
    baseRef: null,
    workBranch: `mono-cut/${id}`,
    candidateId: null,
    candidate: null,
    attempt: 0,
    lastGreenCheckpoint: null,
    lastCheckpoint: null,
    agentSessionId: null,
    lastFailureDigest: null,
    createdAt: now,
    updatedAt: now,
  };
  saveCampaign(state);
  appendEvent(abs, { type: "initialized", campaignId: id });
  return state;
}

export function loadCampaign(root: string): CampaignState | null {
  const path = campaignStatePath(root);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as CampaignState;
}

export function saveCampaign(state: CampaignState): void {
  state.updatedAt = new Date().toISOString();
  mkdirSync(monoCutDir(state.root), { recursive: true });
  writeFileSync(campaignStatePath(state.root), JSON.stringify(state, null, 2));
}

export function setState(
  state: CampaignState,
  next: CampaignStateName,
  extra?: Partial<CampaignState>
): CampaignState {
  Object.assign(state, extra ?? {}, { state: next });
  saveCampaign(state);
  appendEvent(state.root, { type: "state", state: next, campaignId: state.id });
  return state;
}

export function appendEvent(
  root: string,
  event: Record<string, unknown>
): void {
  mkdirSync(monoCutDir(root), { recursive: true });
  appendFileSync(
    eventsPath(root),
    JSON.stringify({ ...event, at: new Date().toISOString() }) + "\n"
  );
}
