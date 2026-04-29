# OpenAPI Tools

Tools for parsing OpenAPI specs and executing HTTP requests by operation ID.

## `parse_openapi`

Parse an OpenAPI 3.x or Swagger 2.0 spec and return a summary of operations.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `specPath` | `string` | yes | Path to spec file (JSON or YAML, within scope) |

**Output:** `{ title, version, servers, operations: [{ operationId, method, path, summary }] }`

Supports JSON and YAML formats. `$ref` pointers are automatically dereferenced. Operations without an `operationId` get one auto-generated from the method + path.

Capped at 200 operations.

---

## `call_api`

Execute an HTTP request by operation ID from an OpenAPI spec.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `specPath` | `string` | yes | Path to spec file |
| `operationId` | `string` | yes | Operation ID to invoke |
| `params` | `Record<string, string>` | no | Path and query parameters |
| `body` | `unknown` | no | Request body (JSON) |
| `headers` | `Record<string, string>` | no | Additional headers |

**Output:** `{ status, headers, body, url }`

**Security:** Only sends requests to hosts listed in the spec's `servers` array. Requests to unlisted hosts are rejected. Response body capped at 100KB. 30-second timeout.
