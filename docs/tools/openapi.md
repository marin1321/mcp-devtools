# OpenAPI Tools

> **Status: Phase 3 -- not yet implemented.** Both tools return
> `NOT_IMPLEMENTED` when called. The schemas below document the planned
> interface; they are defined in source and will be wired up in a future
> release.

---

### parse_openapi

> Parse an OpenAPI 3.x specification and return a summary of its operations.

**Input**

| Parameter | Type     | Required | Default | Description                                                        |
| --------- | -------- | -------- | ------- | ------------------------------------------------------------------ |
| `path`    | `string` | yes      | --      | Path to the OpenAPI spec file (JSON/YAML), relative to scope root. |

**Output** (planned)

| Field        | Type     | Description                               |
| ------------ | -------- | ----------------------------------------- |
| `title`      | `string` | API title from `info.title`.              |
| `version`    | `string` | API version from `info.version`.          |
| `servers`    | `array`  | List of server URL strings.               |
| `operations` | `array`  | Array of operation summaries (see below). |

Each operation summary:

| Field         | Type       | Description                           |
| ------------- | ---------- | ------------------------------------- |
| `operationId` | `string`   | Unique operation identifier.          |
| `method`      | `string`   | HTTP method (e.g. `"GET"`, `"POST"`). |
| `path`        | `string`   | URL path template.                    |
| `summary`     | `string`   | Short description (if present).       |
| `tags`        | `string[]` | Associated tags (if present).         |

**Current behavior**

Returns `NOT_IMPLEMENTED` for all inputs.

```jsonc
// Request
{ "path": "api/openapi.yaml" }

// Response
{
  "error": {
    "code": "NOT_IMPLEMENTED",
    "message": "parse_openapi is not implemented yet"
  }
}
```

---

### call_api

> Make a typed HTTP request by operation ID using a previously parsed OpenAPI spec.

**Input** (planned)

| Parameter     | Type                                      | Required | Default | Description                        |
| ------------- | ----------------------------------------- | -------- | ------- | ---------------------------------- |
| `specPath`    | `string`                                  | yes      | --      | Path to the OpenAPI spec file.     |
| `operationId` | `string`                                  | yes      | --      | The `operationId` to invoke.       |
| `pathParams`  | `Record<string, string>`                  | no       | `{}`    | Path parameter substitutions.      |
| `queryParams` | `Record<string, string\|number\|boolean>` | no       | `{}`    | Query string parameters.           |
| `body`        | `unknown`                                 | no       | --      | Request body (serialized as JSON). |
| `headers`     | `Record<string, string>`                  | no       | `{}`    | Additional HTTP headers.           |

**Output** (planned)

| Field        | Type                     | Description            |
| ------------ | ------------------------ | ---------------------- |
| `status`     | `number`                 | HTTP status code.      |
| `headers`    | `Record<string, string>` | Response headers.      |
| `body`       | `unknown`                | Parsed response body.  |
| `durationMs` | `number`                 | Round-trip time in ms. |

**Current behavior**

Returns `NOT_IMPLEMENTED` for all inputs.

```jsonc
// Request
{
  "specPath": "api/openapi.yaml",
  "operationId": "getUser",
  "pathParams": { "userId": "42" }
}

// Response
{
  "error": {
    "code": "NOT_IMPLEMENTED",
    "message": "call_api is not implemented yet"
  }
}
```
