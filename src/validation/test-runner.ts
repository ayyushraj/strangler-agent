import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

export interface TestResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
  digest: string;
}

const MAX_CAPTURE = 12_000;

export async function runTests(
  root: string,
  command: string
): Promise<TestResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, {
      cwd: resolve(root),
      shell: true,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      if (stdout.length < MAX_CAPTURE) stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      if (stderr.length < MAX_CAPTURE) stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const combined = `${stdout}\n${stderr}`;
      const digest = createHash("sha256")
        .update(combined.slice(0, 4000))
        .digest("hex")
        .slice(0, 16);
      resolvePromise({
        ok: code === 0,
        code: code ?? 1,
        stdout: stdout.slice(0, MAX_CAPTURE),
        stderr: stderr.slice(0, MAX_CAPTURE),
        digest,
      });
    });
  });
}

export function formatFailureForAgent(result: TestResult): string {
  const stack = extractStack(result.stderr + "\n" + result.stdout);
  return [
    `Tests failed with exit code ${result.code}.`,
    "--- stderr/stack ---",
    stack.slice(0, 8000),
  ].join("\n");
}

function extractStack(text: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(
    (l) => /Error:|FAIL|AssertionError|at\s+\S+/.test(l)
  );
  if (start < 0) return text.slice(0, 8000);
  return lines.slice(start, start + 80).join("\n");
}
