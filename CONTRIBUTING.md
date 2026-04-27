# Contributing to mcp-devtools

Thanks for your interest! `mcp-devtools` is open to contributions of any size,
from typo fixes to new tools.

## Local development

```bash
git clone https://github.com/marin1321/mcp-devtools.git
cd mcp-devtools
nvm use         # Node 20 LTS
npm install
cp .env.example .env
npm run dev     # tsup --watch
```

## Quality gates

Every PR must pass:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Coverage thresholds (Vitest): **80% lines / functions / statements, 75% branches**.

## Commit convention

We use [Conventional Commits](https://www.conventionalcommits.org/) so
`semantic-release` can determine version bumps automatically.

| Prefix             | Effect                                            |
| ------------------ | ------------------------------------------------- |
| `feat:`            | minor bump — new tool, transport, or config field |
| `fix:`             | patch bump — bug fix                              |
| `docs:`            | no version bump                                   |
| `test:`            | no version bump                                   |
| `refactor:`        | no version bump                                   |
| `chore:`           | no version bump                                   |
| `BREAKING CHANGE:` | major bump — config schema or removed tool        |

## Adding a new tool

1. Create `src/tools/<group>/<tool-name>.ts` exporting:
   - `XInput` Zod schema
   - `XOutput` interface
   - `xHandler(input, config) => Promise<ToolResult<XOutput>>`
2. Re-export it from `src/tools/index.ts`.
3. Register it in `src/server.ts` (Phase 1+).
4. Add tests under `tests/<group>/<tool-name>.test.ts`.
5. Add a doc page under `docs/tools/<group>.md`.

## Reporting issues

Please include:

- `mcp-devtools --version`
- `node --version`
- A minimal reproducible config and the failing tool invocation
- The full structured log line from stderr (with secrets redacted)
