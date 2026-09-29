import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

export const CampaignConfigSchema = z.object({
  testCommand: z.string().default("npm test"),
  ciCommand: z.string().default("npm test"),
  maxAttempts: z.number().int().positive().default(5),
  backend: z.enum(["cursor", "noop"]).default("noop"),
  model: z.string().default("composer-2.5"),
  astContextBin: z.string().optional(),
  createPr: z.boolean().default(false),
  dryRun: z.boolean().default(true),
  candidateId: z.string().optional(),
});

export type CampaignConfig = z.infer<typeof CampaignConfigSchema>;

export const DEFAULT_CONFIG: CampaignConfig = CampaignConfigSchema.parse({});

export function stranglerDir(root: string): string {
  return join(resolve(root), ".strangler");
}

export function campaignYamlPath(root: string): string {
  return join(resolve(root), "campaign.yaml");
}

export function campaignStatePath(root: string): string {
  return join(stranglerDir(root), "campaign.json");
}

export function eventsPath(root: string): string {
  return join(stranglerDir(root), "events.jsonl");
}

export function loadConfig(root: string): CampaignConfig {
  const path = campaignYamlPath(root);
  if (!existsSync(path)) {
    return { ...DEFAULT_CONFIG };
  }
  const raw = parseYaml(readFileSync(path, "utf8"));
  return CampaignConfigSchema.parse(raw ?? {});
}

export function writeDefaultConfig(root: string, overrides: Partial<CampaignConfig> = {}): CampaignConfig {
  const cfg = CampaignConfigSchema.parse({ ...DEFAULT_CONFIG, ...overrides });
  const abs = resolve(root);
  mkdirSync(abs, { recursive: true });
  writeFileSync(campaignYamlPath(abs), stringifyYaml(cfg));
  mkdirSync(stranglerDir(abs), { recursive: true });
  return cfg;
}

export function resolveAstContextBin(cfg: CampaignConfig): string {
  if (cfg.astContextBin) return cfg.astContextBin;
  if (process.env.AST_CONTEXT_BIN) return process.env.AST_CONTEXT_BIN;
  // Prefer sibling checkout used in this workspace
  const sibling = resolve(
    import.meta.dirname,
    "../../ast-context/dist/cli.js"
  );
  if (existsSync(sibling)) return `node ${sibling}`;
  return "npx ast-context";
}
