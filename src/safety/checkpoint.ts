import { spawn } from "node:child_process";
import { resolve } from "node:path";

export interface CheckpointResult {
  ref: string;
  sha: string;
}

function git(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      cwd: resolve(cwd),
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
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

const GIT_IDENT = ["-c", "user.email=strangler-agent@local", "-c", "user.name=strangler-agent"];

export async function ensureGitRepo(cwd: string): Promise<void> {
  const status = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (status.code !== 0) {
    await git(cwd, ["init"]);
    await git(cwd, [...GIT_IDENT, "add", "-A"]);
    await git(cwd, [
      ...GIT_IDENT,
      "commit",
      "-m",
      "chore: initial commit for strangler-agent campaign",
      "--allow-empty",
    ]);
  }
}

export async function createWorkBranch(
  cwd: string,
  branch: string
): Promise<string> {
  await ensureGitRepo(cwd);
  const head = await git(cwd, ["rev-parse", "HEAD"]);
  if (head.code !== 0) {
    await git(cwd, [...GIT_IDENT, "add", "-A"]);
    await git(cwd, [
      ...GIT_IDENT,
      "commit",
      "-m",
      "chore: baseline",
      "--allow-empty",
    ]);
  }
  const base = (await git(cwd, ["rev-parse", "HEAD"])).stdout;
  const existing = await git(cwd, ["rev-parse", "--verify", branch]);
  if (existing.code === 0) {
    await git(cwd, ["checkout", branch]);
  } else {
    await git(cwd, ["checkout", "-b", branch]);
  }
  return base;
}

export async function createCheckpoint(
  cwd: string,
  campaignId: string,
  n: number,
  message: string
): Promise<CheckpointResult> {
  await git(cwd, [...GIT_IDENT, "add", "-A"]);
  // Do not snapshot campaign metadata into extraction commits
  await git(cwd, ["reset", "HEAD", "--", ".strangler", "campaign.yaml"]);
  const commit = await git(cwd, [
    ...GIT_IDENT,
    "commit",
    "-m",
    `strangler-agent: ${message}`,
    "--allow-empty",
  ]);
  if (commit.code !== 0) {
    throw new Error(`checkpoint commit failed: ${commit.stderr || commit.stdout}`);
  }
  const sha = (await git(cwd, ["rev-parse", "HEAD"])).stdout;
  const ref = `strangler/cp/${campaignId}/${n}`;
  await git(cwd, ["tag", "-f", ref, sha]);
  return { ref, sha };
}

export async function rollbackTo(
  cwd: string,
  refOrSha: string
): Promise<void> {
  const result = await git(cwd, ["reset", "--hard", refOrSha]);
  if (result.code !== 0) {
    throw new Error(`rollback failed: ${result.stderr || result.stdout}`);
  }
}

export async function currentHead(cwd: string): Promise<string> {
  return (await git(cwd, ["rev-parse", "HEAD"])).stdout;
}
