# MCP Prompts

MCP Prompts are reusable, parameterized templates that clients can present to users. `mcp-devtools` includes four curated development prompts.

## `debug_error`

Systematically debug an error using mcp-devtools tools.

| Argument | Required | Description |
|----------|----------|-------------|
| `error_message` | yes | The error message or stack trace |
| `file_path` | no | Path to the file where the error occurs |

**What it does:** Guides the AI through a structured debugging workflow — reading the file (if provided), searching for related code patterns, checking logs, and proposing a fix.

## `code_review`

Review a file for bugs, security issues, and code quality.

| Argument | Required | Description |
|----------|----------|-------------|
| `file_path` | yes | Path to the file to review |

**What it does:** Instructs the AI to read the file, check for error handling, input validation, security issues, and find related tests.

## `explore_codebase`

Explore and understand a project's structure and conventions.

| Argument | Required | Description |
|----------|----------|-------------|
| `focus_area` | no | Area to focus on (e.g., "database", "auth", "api") |

**What it does:** Guides the AI to list directories, read key files (README, package.json, config), and summarize the architecture.

## `refactor_function`

Refactor a function for readability, performance, or testability.

| Argument | Required | Description |
|----------|----------|-------------|
| `file_path` | yes | Path to the file containing the function |
| `function_name` | yes | Name of the function to refactor |

**What it does:** Instructs the AI to read the function, find usages and tests, analyze complexity, and propose a refactored version.

## Usage

In compatible MCP clients, prompts appear as selectable templates. For example, in Claude Desktop you might select the `debug_error` prompt, provide the error message, and the AI will follow the structured debugging workflow using mcp-devtools tools.
