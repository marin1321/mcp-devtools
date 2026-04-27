# Changelog

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
and uses [Conventional Commits](https://www.conventionalcommits.org/) so
`semantic-release` can generate releases automatically.

## [Unreleased]

### Added

- Phase 0 scaffolding: TypeScript strict config, tsup dual ESM/CJS build,
  ESLint 9 flat config, Prettier, Vitest with v8 coverage thresholds.
- Config schema (`McpDevtoolsConfigSchema`) and cosmiconfig loader.
- Domain error taxonomy (`ScopeViolationError`, `DatabaseError`,
  `CommandError`, etc.) and `ToolResult` discriminated union.
- Structured pino logger writing JSON to stderr with secret redaction.
- Tool stubs for all 14 v1 tools across filesystem, database, process,
  and openapi groups.
- GitHub Actions CI (lint + typecheck + test + build) and release pipeline.
