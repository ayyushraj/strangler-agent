import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface FileRow {
  id: number;
  path: string;
  language: string;
}

export interface SymbolRow {
  id: number;
  file_id: number;
  name: string;
  kind: string;
  container: string | null;
  signature: string | null;
  type_text: string | null;
  path: string;
}

export interface ImportRow {
  file_id: number;
  path: string;
  source_module: string;
  local_name: string;
  imported_name: string | null;
}

export interface CallRow {
  caller_symbol_id: number | null;
  callee_name: string;
  callee_symbol_id: number | null;
  file_id: number;
  path: string;
}

export class IndexReader {
  constructor(private readonly db: DatabaseSync) {}

  static open(root: string): IndexReader {
    const dbPath = join(resolve(root), ".ast-context", "index.db");
    if (!existsSync(dbPath)) {
      throw new Error(`No ast-context index at ${dbPath}. Run analyze/index first.`);
    }
    const db = new DatabaseSync(dbPath, { readOnly: true });
    return new IndexReader(db);
  }

  close(): void {
    this.db.close();
  }

  files(): FileRow[] {
    return this.db
      .prepare("SELECT id, path, language FROM files ORDER BY path")
      .all() as unknown as FileRow[];
  }

  symbols(): SymbolRow[] {
    return this.db
      .prepare(
        `SELECT s.id, s.file_id, s.name, s.kind, s.container, s.signature, s.type_text, f.path
         FROM symbols s JOIN files f ON f.id = s.file_id`
      )
      .all() as unknown as SymbolRow[];
  }

  imports(): ImportRow[] {
    return this.db
      .prepare(
        `SELECT i.file_id, f.path, i.source_module, i.local_name, i.imported_name
         FROM imports i JOIN files f ON f.id = i.file_id`
      )
      .all() as unknown as ImportRow[];
  }

  calls(): CallRow[] {
    return this.db
      .prepare(
        `SELECT c.caller_symbol_id, c.callee_name, c.callee_symbol_id, c.file_id, f.path
         FROM calls c JOIN files f ON f.id = c.file_id`
      )
      .all() as unknown as CallRow[];
  }

  publicExports(filePathPrefix?: string): SymbolRow[] {
    const all = this.symbols().filter(
      (s) =>
        s.kind === "function" ||
        s.kind === "class" ||
        s.kind === "variable" ||
        s.kind === "method"
    );
    if (!filePathPrefix) return all;
    return all.filter((s) => s.path.startsWith(filePathPrefix));
  }
}

export function indexDbPath(root: string): string {
  return join(resolve(root), ".ast-context", "index.db");
}
