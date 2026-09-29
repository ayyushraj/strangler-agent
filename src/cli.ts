#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import {
  loadConfig,
  writeDefaultConfig,
  type CampaignConfig,
} from "./config.js";
import {
  createCampaign,
  loadCampaign,
} from "./orchestrator/campaign.js";
import { runAnalyzeOnly, runPipeline } from "./orchestrator/pipeline.js";

const program = new Command();

program
  .name("strangler-agent")
  .description("Strangler Fig refactoring engine — agentic monolith-to-microservice extraction")
  .version("0.1.0");

program
  .command("init")
  .requiredOption("--root <path>", "target repository root")
  .option("--backend <name>", "cursor | noop", "noop")
  .action((opts: { root: string; backend: string }) => {
    const root = resolve(opts.root);
    const cfg = writeDefaultConfig(root, {
      backend: opts.backend === "cursor" ? "cursor" : "noop",
      dryRun: true,
      createPr: false,
    });
    createCampaign(root, cfg);
    console.log(`Initialized strangler-agent in ${root}`);
    console.log(`Wrote campaign.yaml (backend=${cfg.backend}, dryRun=${cfg.dryRun})`);
  });

program
  .command("analyze")
  .requiredOption("--root <path>", "target repository root")
  .action(async (opts: { root: string }) => {
    const root = resolve(opts.root);
    const cfg = loadConfig(root);
    const { analysis } = await runAnalyzeOnly(root, cfg);
    console.log(JSON.stringify({
      recommended: analysis.recommended?.id ?? null,
      candidates: analysis.candidates.map((c) => ({
        id: c.id,
        directory: c.directory,
        riskScore: c.riskScore,
        cohesion: Number(c.cohesion.toFixed(3)),
        coupling: c.coupling,
        files: c.files.length,
        externalCallers: c.externalCallers,
      })),
    }, null, 2));
  });

program
  .command("extract")
  .requiredOption("--root <path>", "target repository root")
  .option("--candidate <id>", "candidate id from analyze")
  .action(async (opts: { root: string; candidate?: string }) => {
    const root = resolve(opts.root);
    const cfg: CampaignConfig = {
      ...loadConfig(root),
      candidateId: opts.candidate ?? loadConfig(root).candidateId,
    };
    const result = await runPipeline(root, cfg);
    printPipelineResult(result);
    process.exitCode = result.ok ? 0 : 1;
  });

program
  .command("run")
  .requiredOption("--root <path>", "target repository root")
  .option("--backend <name>", "override backend")
  .option("--candidate <id>", "candidate id")
  .option("--create-pr", "create GitHub PR when green")
  .option("--no-dry-run", "disable dry-run (allow real PR if --create-pr)")
  .action(
    async (opts: {
      root: string;
      backend?: string;
      candidate?: string;
      createPr?: boolean;
      dryRun?: boolean;
    }) => {
      const root = resolve(opts.root);
      const base = loadConfig(root);
      const cfg: CampaignConfig = {
        ...base,
        backend:
          opts.backend === "cursor"
            ? "cursor"
            : opts.backend === "noop"
              ? "noop"
              : base.backend,
        candidateId: opts.candidate ?? base.candidateId,
        createPr: Boolean(opts.createPr) || base.createPr,
        dryRun: opts.dryRun === false ? false : base.dryRun,
      };
      if (opts.createPr && opts.dryRun === false) {
        cfg.dryRun = false;
      }
      const result = await runPipeline(root, cfg);
      printPipelineResult(result);
      process.exitCode = result.ok ? 0 : 1;
    }
  );

program
  .command("status")
  .requiredOption("--root <path>", "target repository root")
  .action((opts: { root: string }) => {
    const root = resolve(opts.root);
    const state = loadCampaign(root);
    if (!state) {
      console.log(JSON.stringify({ status: "no_campaign" }));
      return;
    }
    console.log(
      JSON.stringify(
        {
          id: state.id,
          state: state.state,
          branch: state.workBranch,
          candidateId: state.candidateId,
          attempt: state.attempt,
          lastGreenCheckpoint: state.lastGreenCheckpoint,
          lastFailureDigest: state.lastFailureDigest,
          updatedAt: state.updatedAt,
        },
        null,
        2
      )
    );
  });

function printPipelineResult(result: {
  ok: boolean;
  state: { id: string; state: string; attempt: number; workBranch: string };
  prUrl?: string;
  prBody?: string;
}) {
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        campaign: result.state.id,
        state: result.state.state,
        attempts: result.state.attempt,
        branch: result.state.workBranch,
        prUrl: result.prUrl ?? null,
      },
      null,
      2
    )
  );
  if (result.prBody) {
    console.log("\n--- PR body ---\n");
    console.log(result.prBody);
  }
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
