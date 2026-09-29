#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { rmSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "fixtures/demo-monolith");
const cli = resolve(root, "dist/cli.js");

function run(cmd, args, cwd = root) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: false });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

/** Undo a prior noop extraction so the fixture is a true monolith again. */
function resetInventoryBaseline() {
  const inv = join(fixture, "src/inventory");
  const facade = join(inv, "facade.ts");
  if (existsSync(facade)) unlinkSync(facade);

  writeFileSync(
    join(inv, "service.ts"),
    `import { getStock, setStock } from "../db.js";

export function checkAvailability(sku: string, qty: number): boolean {
  return getStock(sku) >= qty;
}

export function reserveStock(sku: string, qty: number): boolean {
  if (!checkAvailability(sku, qty)) return false;
  setStock(sku, getStock(sku) - qty);
  return true;
}

export function releaseStock(sku: string, qty: number): void {
  setStock(sku, getStock(sku) + qty);
}

export function getInventoryLevel(sku: string): number {
  return getStock(sku);
}
`
  );

  writeFileSync(
    join(inv, "index.ts"),
    `export {
  checkAvailability,
  reserveStock,
  releaseStock,
  getInventoryLevel,
} from "./service.js";
`
  );
}

// Fresh git baseline so prior campaign commits cannot restore broken files
for (const p of [".git", ".mono-cut", ".ast-context", "services", "campaign.yaml"]) {
  const abs = resolve(fixture, p);
  if (existsSync(abs)) rmSync(abs, { recursive: true, force: true });
}
resetInventoryBaseline();

run("npm", ["install"], fixture);
run("npx", ["vitest", "run"], fixture);
run("node", [cli, "init", "--root", fixture, "--backend", "noop"]);
run("node", [cli, "analyze", "--root", fixture]);
run("node", [cli, "run", "--root", fixture, "--backend", "noop"]);
console.log("smoke ok");
