# OpenAPI Tools

Tools for parsing OpenAPI specifications and making spec-driven HTTP requests
against local dev servers.

---

### parse_openapi

> Parse an OpenAPI 3.x (or Swagger 2.0) specification and return a structured
> summary of its operations, servers, and metadata.

**Input**

| Parameter | Type     | Required | Default | Description                                                        |
| --------- | -------- | -------- | ------- | ------------------------------------------------------------------ |
| `path`    | `string` | yes      | --      | Path to the OpenAPI spec file (JSON/YAML), relative to scope root. |

**Output**

| Field        | Type     | Description                               |
| ------------ | -------- | ----------------------------------------- |
| `title`      | `string` | API title from `info.title`.              |
| `version`    | `string` | API version from `info.version`.          |
| `servers`    | `array`  | List of server URL strings.               |
| `operations` | `array`  | Array of operation summaries (see below). |

Each operation summary:

| Field         | Type       | Description                                                              |
| ------------- | ---------- | ------------------------------------------------------------------------ |
| `operationId` | `string`   | Unique operation identifier. Auto-generated as `METHOD_path` if missing. |
| `method`      | `string`   | HTTP method (uppercase, e.g. `"GET"`, `"POST"`).                         |
| `path`        | `string`   | URL path template (e.g. `"/users/{id}"`).                                |
| `summary`     | `string?`  | Short description (if present in the spec).                              |
| `tags`        | `string[]` | Associated tags (if present in the spec).                                |

Operations are capped at 200 entries. Both JSON and YAML spec files are
supported. The spec is fully dereferenced (`$ref` pointers are resolved).

**Errors**

| Code               | When                                     |
| ------------------ | ---------------------------------------- |
| `SCOPE_VIOLATION`  | Spec file path resolves outside scope.   |
| `FILESYSTEM_ERROR` | Spec file not found or unreadable.       |
| `VALIDATION_ERROR` | Spec is not a valid OpenAPI/Swagger doc. |

**Example**

```jsonc
// Request
{ "path": "api/openapi.yaml" }

// Response
{
  "title": "Pet Store API",
  "version": "1.0.0",
  "servers": ["http://localhost:3000"],
  "operations": [
    {
      "operationId": "listPets",
      "method": "GET",
      "path": "/pets",
      "summary": "List all pets",
      "tags": ["pets"]
    }
  ]
}
```

---

### call_api

> Execute an HTTP request against a local dev server by looking up an operation
> in an OpenAPI spec.

**Input**

| Parameter     | Type                                      | Required | Default | Description                        |
| ------------- | ----------------------------------------- | -------- | ------- | ---------------------------------- |
| `specPath`    | `string`                                  | yes      | --      | Path to the OpenAPI spec file.     |
| `operationId` | `string`                                  | yes      | --      | The `operationId` to invoke.       |
| `pathParams`  | `Record<string, string>`                  | no       | `{}`    | Path parameter substitutions.      |
| `queryParams` | `Record<string, string\|number\|boolean>` | no       | `{}`    | Query string parameters.           |
| `body`        | `unknown`                                 | no       | --      | Request body (serialized as JSON). |
| `headers`     | `Record<string, string>`                  | no       | `{}`    | Additional HTTP headers.           |

**Output**

| Field        | Type                     | Description                                          |
| ------------ | ------------------------ | ---------------------------------------------------- |
| `status`     | `number`                 | HTTP status code.                                    |
| `headers`    | `Record<string, string>` | Response headers.                                    |
| `body`       | `unknown`                | Parsed response body (JSON if parseable, else text). |
| `durationMs` | `number`                 | Round-trip time in ms.                               |

Response body is capped at 100KB. The tool uses Node.js native `fetch` with a
30-second timeout.

**Security: Host Restriction**

`call_api` only sends requests to hosts listed in the spec's `servers` array.
If no servers are defined, only `localhost` and `127.0.0.1` are allowed.
Requests to any other host are rejected with `VALIDATION_ERROR`.

**Errors**

| Code               | When                                                |
| ------------------ | --------------------------------------------------- |
| `SCOPE_VIOLATION`  | Spec file path resolves outside scope.              |
| `VALIDATION_ERROR` | Operation not found, invalid spec, or host blocked. |
| `COMMAND_ERROR`    | Network error during the HTTP request.              |
| `TIMEOUT`          | Request exceeded the 30-second timeout.             |

**Example**

```jsonc
// Request
{
  "specPath": "api/openapi.yaml",
  "operationId": "getUser",
  "pathParams": { "userId": "42" }
}

// Response
{
  "status": 200,
  "headers": { "content-type": "application/json" },
  "body": { "id": 42, "name": "Alice" },
  "durationMs": 12
}
```
