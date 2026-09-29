import type { CampaignConfig } from "../config.js";
import type { ExtractionCandidate } from "../analyzer/seam-finder.js";
import type { AgentSession } from "../agents/types.js";
import {
  buildExtractPrompt,
  buildFixFromAstPrompt,
  buildFixFromTestPrompt,
} from "../agents/prompts.js";
import {
  appendEvent,
  saveCampaign,
  setState,
  type CampaignState,
} from "../orchestrator/campaign.js";
import { createCheckpoint } from "../safety/checkpoint.js";
import { rollbackCampaign } from "../safety/rollback.js";
import { digestFailures, validateAstDiff, type AstDiffReport } from "./ast-diff.js";
import { formatFailureForAgent, runTests } from "./test-runner.js";

export interface LoopResult {
  ok: boolean;
  state: CampaignState;
  attempts: number;
  lastAst?: AstDiffReport;
}

export async function runValidationLoop(opts: {
  state: CampaignState;
  cfg: CampaignConfig;
  candidate: ExtractionCandidate;
  session: AgentSession;
  /** When true, skip agent extract (noop already applied changes). */
  skipInitialExtract?: boolean;
}): Promise<LoopResult> {
  const { state, cfg, candidate, session } = opts;
  const baselineExports = [...candidate.publicExports];
  let seenDigests = new Set<string>();

  if (!opts.skipInitialExtract) {
    state.attempt += 1;
    const cp = await createCheckpoint(
      state.root,
      state.id,
      state.attempt,
      `before-extract-attempt-${state.attempt}`
    );
    state.lastCheckpoint = cp.ref;
    setState(state, "extracting");
    saveCampaign(state);

    const extractResult = await session.send(
      buildExtractPrompt(candidate, state.root)
    );
    appendEvent(state.root, {
      type: "agent_extract",
      status: extractResult.status,
      attempt: state.attempt,
    });
    if (extractResult.status === "error") {
      await rollbackCampaign(state, "agent extract error");
      return { ok: false, state, attempts: state.attempt };
    }
  }

  while (state.attempt <= cfg.maxAttempts) {
    setState(state, "validating");
    const ast = await validateAstDiff(state.root, cfg, candidate, baselineExports);
    if (!ast.ok) {
      const dig = digestFailures(ast);
      appendEvent(state.root, { type: "ast_fail", digest: dig, failures: ast.failures });
      if (seenDigests.has(dig) || state.attempt >= cfg.maxAttempts) {
        await rollbackCampaign(state, `AST gates failed: ${dig}`);
        return { ok: false, state, attempts: state.attempt, lastAst: ast };
      }
      seenDigests.add(dig);
      state.attempt += 1;
      state.lastFailureDigest = dig;
      const cp = await createCheckpoint(
        state.root,
        state.id,
        state.attempt,
        `before-ast-fix-${state.attempt}`
      );
      state.lastCheckpoint = cp.ref;
      saveCampaign(state);
      await session.send(buildFixFromAstPrompt(ast, candidate));
      continue;
    }

    const tests = await runTests(state.root, cfg.testCommand);
    if (!tests.ok) {
      appendEvent(state.root, {
        type: "test_fail",
        digest: tests.digest,
        code: tests.code,
      });
      if (seenDigests.has(tests.digest) || state.attempt >= cfg.maxAttempts) {
        await rollbackCampaign(state, `tests failed: ${tests.digest}`);
        return { ok: false, state, attempts: state.attempt, lastAst: ast };
      }
      seenDigests.add(tests.digest);
      state.attempt += 1;
      state.lastFailureDigest = tests.digest;
      const cp = await createCheckpoint(
        state.root,
        state.id,
        state.attempt,
        `before-test-fix-${state.attempt}`
      );
      state.lastCheckpoint = cp.ref;
      saveCampaign(state);
      await session.send(buildFixFromTestPrompt(formatFailureForAgent(tests), candidate));
      continue;
    }

    // Optional CI command
    if (cfg.ciCommand && cfg.ciCommand !== cfg.testCommand) {
      const ci = await runTests(state.root, cfg.ciCommand);
      if (!ci.ok) {
        appendEvent(state.root, { type: "ci_fail", digest: ci.digest });
        if (state.attempt >= cfg.maxAttempts) {
          await rollbackCampaign(state, `ci failed: ${ci.digest}`);
          return { ok: false, state, attempts: state.attempt, lastAst: ast };
        }
        state.attempt += 1;
        await session.send(buildFixFromTestPrompt(formatFailureForAgent(ci), candidate));
        continue;
      }
    }

    const green = await createCheckpoint(
      state.root,
      state.id,
      state.attempt,
      "green"
    );
    state.lastGreenCheckpoint = green.ref;
    state.lastCheckpoint = green.ref;
    setState(state, "green");
    appendEvent(state.root, { type: "green", ref: green.ref, attempts: state.attempt });
    return { ok: true, state, attempts: state.attempt, lastAst: ast };
  }

  await rollbackCampaign(state, "max attempts exceeded");
  return { ok: false, state, attempts: state.attempt };
}
