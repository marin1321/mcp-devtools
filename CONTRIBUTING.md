# Contributing to mcp-devtools

Thank you for your interest in contributing to `mcp-devtools`. This guide
explains how to set up a local development environment, submit changes, and
add new tools.

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** (ships with Node.js)
- **Git**

## Development setup

```bash
git clone https://github.com/marin1321/mcp-devtools.git
cd mcp-devtools
npm install
```

Verify everything works:

```bash
npm run lint        # ESLint
npm run format:check # Prettier
npm run typecheck   # tsc --noEmit
npm run test        # Vitest
npm run build       # tsup (ESM + CJS)
```

## Branch naming

Create a branch from `main` using one of these prefixes:

| Prefix   | Use                       |
| -------- | ------------------------- |
| `feat/`  | New feature or tool       |
| `fix/`   | Bug fix                   |
| `docs/`  | Documentation only        |
| `test/`  | Test additions or fixes   |
| `chore/` | Dependencies, CI, configs |

Example: `feat/list-processes`, `fix/symlink-scope-check`.

## Commit convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/).
The commit prefix determines the semantic version bump:

| Prefix             | Version bump |
| ------------------ | ------------ |
| `feat:`            | minor        |
| `fix:`             | patch        |
| `docs:`            | none         |
| `test:`            | none         |
| `refactor:`        | none         |
| `chore:`           | none         |
| `BREAKING CHANGE:` | major        |

## Pull request process

1. Fork the repository and create a branch from `main`.
2. Make your changes with tests.
3. Ensure all quality gates pass:
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run format:check
   ```
4. Open a pull request against `main`.
5. Describe **why** the change is needed, not just what it does.
6. One maintainer approval is required before merging.

## Adding a new tool

Every tool follows a three-layer pattern:

### 1. Schema (Zod)

Define the input schema in `src/tools/<group>/<tool-name>.ts`:

```typescript
export const MyToolInput = z.object({
  param: z.string().min(1).describe("Description for the AI agent"),
});
```

### 2. Handler

Implement the handler as a pure async function:

```typescript
export async function myToolHandler(
  input: MyToolInput,
  config: McpDevtoolsConfig,
): Promise<ToolResult<MyToolOutput>> {
  // implementation
  return ok({ ... });
}
```

### 3. Registration

Add the tool to `src/tools/index.ts`:

```typescript
defineTool({
  name: "my_tool",
  title: "My Tool",
  description: "What this tool does.",
  inputSchema: MyToolInput,
  handler: myToolHandler,
}),
```

### Testing

Create `tests/<group>/<tool-name>.test.ts` with tests covering happy paths,
error cases, and edge cases. The project enforces a minimum of 80% code
coverage.

## Code style

ESLint and Prettier handle all formatting decisions. Run `npm run format`
before committing to auto-fix style issues. The CI pipeline will reject
PRs with lint or formatting errors.

## License

By contributing, you agree that your contributions will be licensed under
the project's [MIT License](LICENSE).
