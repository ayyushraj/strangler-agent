import type { CampaignState } from "../orchestrator/campaign.js";
import { appendEvent, saveCampaign, setState } from "../orchestrator/campaign.js";
import { rollbackTo } from "./checkpoint.js";

export async function rollbackCampaign(
  state: CampaignState,
  reason: string
): Promise<CampaignState> {
  const target = state.lastGreenCheckpoint ?? state.baseRef;
  if (!target) {
    setState(state, "failed", {});
    appendEvent(state.root, {
      type: "rollback_failed",
      reason: "no checkpoint",
      detail: reason,
    });
    throw new Error(`Cannot rollback: no green checkpoint or base ref (${reason})`);
  }
  await rollbackTo(state.root, target);
  setState(state, "rolled_back", {});
  appendEvent(state.root, {
    type: "rolled_back",
    to: target,
    reason,
  });
  saveCampaign(state);
  return state;
}
