# mono-cut

Automated **monolith-to-microservice** refactoring harness: static analysis via [ast-context](../ast-context), pluggable agent backends (Cursor SDK or offline noop), AST + test validation loops, git checkpoints/rollback, and PR creation only when gates are green.

## Requirements

- Node.js 22+
- Sibling or installed [`ast-context`](../ast-context) (`AST_CONTEXT_BIN` or default `../ast-context/dist/cli.js`)
- For `backend=cursor`: `CURSOR_API_KEY`
- For real PRs: GitHub CLI (`gh`) and `createPr: true` with `dryRun: false`

## Install

```bash
cd mono-cut
npm install
npm run build
```

## Quick start (demo fixture)

```bash
npm run smoke
# or manually:
node dist/cli.js init --root fixtures/demo-monolith --backend noop
node dist/cli.js analyze --root fixtures/demo-monolith
node dist/cli.js run --root fixtures/demo-monolith --backend noop
```

The noop backend applies a deterministic inventory extraction (facade + `services/inventory`) so the full loop runs without an API key.

## CLI

| Command | Purpose |
|---------|---------|
| `mono-cut init --root <repo>` | Write `campaign.yaml` + `.mono-cut/` |
| `mono-cut analyze --root <repo>` | Index with ast-context, rank seams |
| `mono-cut extract --root <repo> [--candidate id]` | Extract one candidate through validation |
| `mono-cut run --root <repo>` | Full pipeline → dry-run PR body |
| `mono-cut status --root <repo>` | Campaign state |

## campaign.yaml

```yaml
testCommand: npm test
ciCommand: npm test
maxAttempts: 5
backend: noop          # or cursor
model: composer-2.5
createPr: false
dryRun: true
```

## Safety model

- Work on branch `mono-cut/<campaign-id>`
- Checkpoint tags `mono-cut/cp/<id>/<n>` before each agent attempt
- Rollback to last green checkpoint (or base) when attempts/digests exhaust
- AST gates: export coverage, signature stability, caller continuity, topology
- PR only after AST + tests (+ optional CI) pass

See [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md).

## License

MIT
