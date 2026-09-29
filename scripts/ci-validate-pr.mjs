#!/usr/bin/env node
/**
 * CI / PR status validator for strangler-agent campaigns.
 *
 * - Asserts .strangler/campaign.json is in an acceptable terminal state
 * - Writes GitHub Actions outputs + step summary when running in CI
 * - Optionally comments on the PR (notify) via `gh`
 * - Emits a machine-readable status file for local orchestrators to poll
 *
 * Usage:
 *   node scripts/ci-validate-pr.mjs --root fixtures/demo-monolith
 *   node scripts/ci-validate-pr.mjs --root . --require-campaign
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const GREEN_STATES = new Set(["green", "pr_opened"]);
const FAIL_STATES = new Set(["rolled_back", "failed"]);

function parseArgs(argv) {
  const opts = {
    root: process.cwd(),
    requireCampaign: false,
    comment: process.env.GITHUB_ACTIONS === "true",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") opts.root = resolve(argv[++i] ?? ".");
    else if (a === "--require-campaign") opts.requireCampaign = true;
    else if (a === "--comment") opts.comment = true;
    else if (a === "--no-comment") opts.comment = false;
  }
  return opts;
}

function setOutput(name, value) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  appendFileSync(out, `${name}=${String(value).replace(/\n/g, "%0A")}\n`);
}

function appendSummary(md) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  appendFileSync(path, md + "\n");
}

function loadCampaign(root) {
  const path = join(root, ".strangler", "campaign.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeStatusArtifact(root, payload) {
  const dir = join(root, ".strangler");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "ci-status.json");
  writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
  return file;
}

function commentOnPr(body) {
  let pr = process.env.PR_NUMBER || null;
  if (!pr && process.env.GITHUB_EVENT_PATH && existsSync(process.env.GITHUB_EVENT_PATH)) {
    try {
      const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
      pr = ev.pull_request?.number ?? ev.number ?? null;
    } catch {
      pr = null;
    }
  }
  if (!pr || !process.env.GITHUB_TOKEN) {
    console.log("skip PR comment (no PR number or GITHUB_TOKEN)");
    return;
  }
  const r = spawnSync(
    "gh",
    ["pr", "comment", String(pr), "--body", body],
    { encoding: "utf8", env: process.env }
  );
  if (r.status !== 0) {
    console.warn("gh pr comment failed:", r.stderr || r.stdout);
  } else {
    console.log("Posted PR status comment");
  }
}

function main() {
  const opts = parseArgs(process.argv);
  const root = resolve(opts.root);
  const campaign = loadCampaign(root);

  const result = {
    ok: true,
    root,
    sha: process.env.GITHUB_SHA ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    validatedAt: new Date().toISOString(),
    campaign: null,
    reason: "no_campaign",
  };

  if (!campaign) {
    if (opts.requireCampaign) {
      result.ok = false;
      result.reason = "missing_campaign";
      console.error(`No .strangler/campaign.json under ${root}`);
      writeStatusArtifact(root, result);
      setOutput("strangler_ok", "false");
      setOutput("strangler_state", "missing");
      process.exit(1);
    }
    console.log("No campaign state present — package-only CI OK");
    writeStatusArtifact(root, result);
    setOutput("strangler_ok", "true");
    setOutput("strangler_state", "none");
    appendSummary("## strangler-agent CI\n\nNo campaign artifact; build/smoke gates only.\n");
    return;
  }

  result.campaign = {
    id: campaign.id,
    state: campaign.state,
    attempt: campaign.attempt,
    candidateId: campaign.candidateId,
    branch: campaign.workBranch,
    lastGreenCheckpoint: campaign.lastGreenCheckpoint,
    lastFailureDigest: campaign.lastFailureDigest,
  };

  if (FAIL_STATES.has(campaign.state)) {
    result.ok = false;
    result.reason = `campaign_${campaign.state}`;
  } else if (!GREEN_STATES.has(campaign.state)) {
    result.ok = false;
    result.reason = `campaign_incomplete:${campaign.state}`;
  } else if (campaign.attempt > 3) {
    // Soft check: defaults are 3-strike; warn if campaign exceeded policy
    result.ok = false;
    result.reason = `exceeded_3_strike_policy:attempts=${campaign.attempt}`;
  } else {
    result.reason = "campaign_green";
  }

  const statusFile = writeStatusArtifact(root, result);
  setOutput("strangler_ok", result.ok ? "true" : "false");
  setOutput("strangler_state", campaign.state);
  setOutput("strangler_campaign_id", campaign.id);
  setOutput("strangler_attempts", String(campaign.attempt));
  setOutput("strangler_status_file", statusFile);

  const summary = [
    "## strangler-agent campaign validation",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| Campaign | \`${campaign.id}\` |`,
    `| State | \`${campaign.state}\` |`,
    `| Attempts | ${campaign.attempt} / 3 |`,
    `| Candidate | \`${campaign.candidateId ?? "n/a"}\` |`,
    `| Branch | \`${campaign.workBranch}\` |`,
    `| Result | ${result.ok ? "✅ pass" : "❌ fail"} (\`${result.reason}\`) |`,
    "",
  ].join("\n");
  appendSummary(summary);
  console.log(JSON.stringify(result, null, 2));

  const commentBody = [
    "### strangler-agent CI status",
    "",
    `- **state:** \`${campaign.state}\``,
    `- **attempts:** ${campaign.attempt}/3`,
    `- **candidate:** \`${campaign.candidateId ?? "n/a"}\``,
    `- **result:** ${result.ok ? "pass" : "fail"} (\`${result.reason}\`)`,
    "",
    result.ok
      ? "Remote validation passed. Safe to review/merge if other checks are green."
      : "Remote validation failed. Local orchestrator should resume / fix and push, or dispatch `strangler-revalidate`.",
  ].join("\n");

  if (opts.comment) commentOnPr(commentBody);

  if (!result.ok) process.exit(1);
}

main();
