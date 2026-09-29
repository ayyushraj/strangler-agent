# strangler-agent system design

## Goal

Run multi-step monolith → microservice extractions with agent assistance, while refusing to open a PR unless structural (AST) and behavioral (tests/CI) gates pass — with automatic rollback when they do not.

## Components

| Module | Role |
|--------|------|
| `analyzer` | Invokes ast-context index; reads SQLite (`files` / `symbols` / `calls` / `imports`); ranks directory seams |
| `agents` | `AgentBackend` interface; `CursorSdkBackend` (`@cursor/sdk` + ast-context MCP); `NoopBackend` scripted extract |
| `validation` | AST diff gates, test runner (stack capture), retry loop with failure digests |
| `safety` | Git work branch, annotated checkpoints, hard-reset rollback |
| `orchestrator` | Campaign state machine + pipeline |
| `pr` | `gh pr create` or dry-run body |

## Campaign states

`initialized → indexed → planned → extracting → validating → green → pr_opened | rolled_back | failed`

State lives in `<root>/.strangler/campaign.json`; audit trail in `events.jsonl`.

## AST gates (honesty bound)

We do **not** claim full semantic equivalence. Gates enforce:

1. **Export coverage** — baseline public symbols still resolve (original path or shim)
2. **Signature stability** — preserved symbols keep `signature` when still at the same path
3. **Caller continuity** — external callers still import the module/facade/client
4. **Topology** — extracted impl must not import forbidden monolith modules (e.g. `orders`)

Behavioral correctness is the **test oracle** (`testCommand` / `ciCommand`).

## Agent loop (3-strike self-healing)

1. Checkpoint
2. Agent extract (or fix prompt with AST report / test stack / compiler+test stderr)
3. Re-index + AST gates
4. On AST fail → fix prompt (dedupe by digest; escalate/rollback on repeat)
5. On AST pass → run `testCommand`; feed stderr/stack on failure
6. Optional local `ciCommand` gate
7. On green → mark green checkpoint → PR gate
8. Hard stop: `maxAttempts` default **3**, or same failure digest twice → `git reset --hard` to last green/base

## GitHub Actions CI/CD

`.github/workflows/ci.yml` runs on PRs and `main`:

1. Build strangler-agent + sibling `ast-context`
2. Run smoke (full orchestrator loop with noop backend)
3. `scripts/ci-validate-pr.mjs` asserts campaign state is green and writes Action outputs / PR comment
4. `repository_dispatch` type `strangler-revalidate` lets a local orchestrator (or bot) re-trigger remote validation after pushing fixes

## Pluggable backends

```ts
interface AgentBackend {
  id: string;
  createSession(opts): Promise<AgentSession>;
}
```

Cursor SDK sessions pass MCP servers inline; they must be re-supplied on `Agent.resume` (not persisted by the SDK).

## Demo fixture

`fixtures/demo-monolith` — Express-style TS app with `orders` / `inventory` / `notify`. Recommended seam: `src-inventory`. Noop extraction moves impl to `services/inventory` and leaves `src/inventory/facade.ts` shims.

## Out of scope (MVP)

- Multi-repo deploy / k8s
- Full typechecker equivalence
- Parallel multi-week scheduler (state machine is ready; queue not built)
- Additional LLM backends beyond the interface + noop
