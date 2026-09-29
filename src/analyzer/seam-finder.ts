import { IndexReader, type SymbolRow } from "./index-reader.js";

export interface ExtractionCandidate {
  id: string;
  directory: string;
  files: string[];
  publicExports: Array<{ name: string; path: string; signature: string | null }>;
  externalCallers: string[];
  internalEdges: number;
  externalEdges: number;
  cohesion: number;
  coupling: number;
  riskScore: number;
}

function dirnameOf(path: string): string | null {
  const parts = path.split("/");
  // Only package dirs: src/<module>/...
  if (parts[0] === "src" && parts.length >= 3) {
    return `src/${parts[1]}`;
  }
  return null;
}

function resolveImportToFile(
  fromPath: string,
  sourceModule: string,
  fileSet: Set<string>
): string | null {
  if (!sourceModule.startsWith(".")) return null;
  const fromDir = fromPath.includes("/")
    ? fromPath.slice(0, fromPath.lastIndexOf("/"))
    : ".";
  let joined = normalizePath(`${fromDir}/${sourceModule}`);
  // TS/NodeNext often imports with .js pointing at .ts sources
  if (joined.endsWith(".js")) {
    joined = joined.slice(0, -3);
  } else if (joined.endsWith(".jsx")) {
    joined = joined.slice(0, -4);
  }
  const candidates = [
    joined,
    `${joined}.ts`,
    `${joined}.tsx`,
    `${joined}.js`,
    `${joined}.jsx`,
    `${joined}/index.ts`,
    `${joined}/index.tsx`,
    `${joined}/index.js`,
  ];
  for (const c of candidates) {
    if (fileSet.has(c)) return c;
  }
  for (const f of fileSet) {
    if (f === joined || f.startsWith(`${joined}.`) || f.startsWith(`${joined}/`)) {
      return f;
    }
  }
  return null;
}

function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

export function findSeams(reader: IndexReader): ExtractionCandidate[] {
  const files = reader.files().filter((f) => !f.path.includes(".test."));
  const fileSet = new Set(files.map((f) => f.path));
  const imports = reader.imports();
  const symbols = reader.symbols();

  const groups = new Map<string, string[]>();
  for (const f of files) {
    const dir = dirnameOf(f.path);
    if (!dir) continue;
    const list = groups.get(dir) ?? [];
    list.push(f.path);
    groups.set(dir, list);
  }

  const edges: Array<{ from: string; to: string }> = [];
  for (const imp of imports) {
    const to = resolveImportToFile(imp.path, imp.source_module, fileSet);
    if (to && to !== imp.path) edges.push({ from: imp.path, to });
  }

  const candidates: ExtractionCandidate[] = [];

  for (const [directory, groupFiles] of groups) {
    const groupSet = new Set(groupFiles);
    let internal = 0;
    let externalOut = 0;
    let externalIn = 0;
    const externalCallerFiles = new Set<string>();

    for (const e of edges) {
      const fromIn = groupSet.has(e.from);
      const toIn = groupSet.has(e.to);
      if (fromIn && toIn) internal++;
      else if (fromIn && !toIn) externalOut++;
      else if (!fromIn && toIn) {
        externalIn++;
        externalCallerFiles.add(e.from);
      }
    }

    const denom = internal + externalOut + externalIn;
    const cohesion = denom === 0 ? 0 : internal / denom;
    const coupling = externalOut + externalIn;
    const riskScore =
      coupling * 2 +
      (1 - cohesion) * 5 +
      (directory.includes("inventory") ? -8 : 0) +
      (directory.includes("orders") ? 4 : 0);

    const publicExports = pickPublicExports(symbols, groupFiles);

    candidates.push({
      id: directory.replace(/\//g, "-"),
      directory,
      files: [...groupFiles].sort(),
      publicExports: publicExports.map((s) => ({
        name: s.name,
        path: s.path,
        signature: s.signature,
      })),
      externalCallers: [...externalCallerFiles]
        .filter((p) => !p.includes(".test."))
        .sort(),
      internalEdges: internal,
      externalEdges: coupling,
      cohesion,
      coupling,
      riskScore,
    });
  }

  return candidates.sort((a, b) => a.riskScore - b.riskScore);
}

function pickPublicExports(symbols: SymbolRow[], files: string[]): SymbolRow[] {
  const set = new Set(files);
  return symbols.filter(
    (s) =>
      set.has(s.path) &&
      (s.kind === "function" || s.kind === "class") &&
      !s.name.startsWith("_")
  );
}
