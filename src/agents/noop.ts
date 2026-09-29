import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AgentBackend, AgentSession, AgentSessionOptions } from "./types.js";

/**
 * Offline backend: performs a deterministic inventory extraction so the
 * full pipeline (AST gates + tests + PR dry-run) is exercisable without Cursor.
 */
export class NoopBackend implements AgentBackend {
  id = "noop";

  async createSession(opts: AgentSessionOptions): Promise<AgentSession> {
    const cwd = resolve(opts.cwd);
    let applied = false;
    return {
      id: `noop-${Date.now()}`,
      async send(prompt: string) {
        const isFix = /AST validation|Tests failed/i.test(prompt);
        if (!applied || isFix) {
          applyInventoryExtraction(cwd);
          applied = true;
        }
        return {
          status: "ok" as const,
          text: applied
            ? "noop: applied inventory facade extraction"
            : "noop: no-op",
        };
      },
      async dispose() {},
    };
  }
}

function applyInventoryExtraction(root: string): void {
  const inventoryDir = join(root, "src/inventory");
  const servicePath = join(inventoryDir, "service.ts");
  const indexPath = join(inventoryDir, "index.ts");
  if (!existsSync(servicePath)) {
    throw new Error(`noop extract expected ${servicePath}`);
  }

  const implDir = join(root, "services/inventory");
  mkdirSync(implDir, { recursive: true });

  // Port for db access — extracted service depends only on this interface
  writeFileSync(
    join(implDir, "db-port.ts"),
    `export interface InventoryDb {
  getStock(sku: string): number;
  setStock(sku: string, qty: number): void;
}
`
  );

  writeFileSync(
    join(implDir, "service.ts"),
    `import type { InventoryDb } from "./db-port.js";

let db: InventoryDb;

export function bindInventoryDb(impl: InventoryDb): void {
  db = impl;
}

export function checkAvailability(sku: string, qty: number): boolean {
  return db.getStock(sku) >= qty;
}

export function reserveStock(sku: string, qty: number): boolean {
  if (!checkAvailability(sku, qty)) return false;
  db.setStock(sku, db.getStock(sku) - qty);
  return true;
}

export function releaseStock(sku: string, qty: number): void {
  db.setStock(sku, db.getStock(sku) + qty);
}

export function getInventoryLevel(sku: string): number {
  return db.getStock(sku);
}
`
  );

  writeFileSync(
    join(implDir, "index.ts"),
    `export {
  bindInventoryDb,
  checkAvailability,
  reserveStock,
  releaseStock,
  getInventoryLevel,
} from "./service.js";
export type { InventoryDb } from "./db-port.js";
`
  );

  // Facade at original path — shims public API + binds monolith db
  writeFileSync(
    join(inventoryDir, "facade.ts"),
    `import { getStock, setStock } from "../db.js";
import {
  bindInventoryDb,
  checkAvailability,
  reserveStock,
  releaseStock,
  getInventoryLevel,
} from "../../services/inventory/index.js";

bindInventoryDb({ getStock, setStock });

export {
  checkAvailability,
  reserveStock,
  releaseStock,
  getInventoryLevel,
};
`
  );

  writeFileSync(
    indexPath,
    `export {
  checkAvailability,
  reserveStock,
  releaseStock,
  getInventoryLevel,
} from "./facade.js";
`
  );

  // Keep original service.ts as thin re-export for signature continuity in index
  writeFileSync(
    servicePath,
    `/** @deprecated implementation moved to services/inventory — shim for AST continuity */
export {
  checkAvailability,
  reserveStock,
  releaseStock,
  getInventoryLevel,
} from "./facade.js";
`
  );
}
