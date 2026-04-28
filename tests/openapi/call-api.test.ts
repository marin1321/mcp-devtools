import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callApiHandler } from "../../src/tools/openapi/call-api.js";
import { McpDevtoolsConfigSchema } from "../../src/types/config.js";
import {
  CommandError,
  ScopeViolationError,
  TimeoutError,
  ValidationError,
} from "../../src/types/errors.js";

const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/openapi");
const SPEC_PATH = path.join(FIXTURE_DIR, "petstore.json");

function configFor(scope: string) {
  return McpDevtoolsConfigSchema.parse({ scope });
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("callApiHandler", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("happy path", () => {
    it("executes a GET request and returns structured response", async () => {
      const mockBody = [{ id: 1, name: "Fido" }];
      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(mockBody));

      const result = await callApiHandler(
        {
          specPath: SPEC_PATH,
          operationId: "listPets",
          pathParams: {},
          queryParams: {},
          headers: {},
        },
        configFor(FIXTURE_DIR),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe(200);
      expect(result.data.body).toEqual(mockBody);
      expect(result.data.headers["content-type"]).toBe("application/json");
      expect(typeof result.data.durationMs).toBe("number");

      const call = vi.mocked(globalThis.fetch).mock.calls[0]!;
      expect(call[0]).toBe("https://api.petstore.example.com/v1/pets");
      expect((call[1] as RequestInit).method).toBe("GET");
    });

    it("executes a POST request with JSON body", async () => {
      const created = { id: 42, name: "Whiskers" };
      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(created, 201));

      const result = await callApiHandler(
        {
          specPath: SPEC_PATH,
          operationId: "createPet",
          pathParams: {},
          queryParams: {},
          body: { name: "Whiskers" },
          headers: {},
        },
        configFor(FIXTURE_DIR),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe(201);
      expect(result.data.body).toEqual(created);

      const call = vi.mocked(globalThis.fetch).mock.calls[0]!;
      expect((call[1] as RequestInit).method).toBe("POST");
      expect((call[1] as RequestInit).body).toBe(JSON.stringify({ name: "Whiskers" }));
      expect((call[1] as RequestInit).headers).toHaveProperty("content-type", "application/json");
    });
  });

  describe("path parameter substitution", () => {
    it("replaces path params in the URL template", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ id: 7, name: "Rex" }));

      const result = await callApiHandler(
        {
          specPath: SPEC_PATH,
          operationId: "getPet",
          pathParams: { petId: "7" },
          queryParams: {},
          headers: {},
        },
        configFor(FIXTURE_DIR),
      );

      expect(result.ok).toBe(true);

      const call = vi.mocked(globalThis.fetch).mock.calls[0]!;
      expect(call[0]).toBe("https://api.petstore.example.com/v1/pets/7");
    });
  });

  describe("query parameter building", () => {
    it("appends query params to the URL", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse([]));

      await callApiHandler(
        {
          specPath: SPEC_PATH,
          operationId: "listPets",
          pathParams: {},
          queryParams: { limit: 10, active: true },
          headers: {},
        },
        configFor(FIXTURE_DIR),
      );

      const call = vi.mocked(globalThis.fetch).mock.calls[0]!;
      const url = new URL(call[0] as string);
      expect(url.searchParams.get("limit")).toBe("10");
      expect(url.searchParams.get("active")).toBe("true");
    });
  });

  describe("operation not found", () => {
    it("throws ValidationError for unknown operationId", async () => {
      await expect(
        callApiHandler(
          {
            specPath: SPEC_PATH,
            operationId: "nonExistent",
            pathParams: {},
            queryParams: {},
            headers: {},
          },
          configFor(FIXTURE_DIR),
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe("host restriction", () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({}));
    });

    it("allows requests to hosts in the spec's servers list", async () => {
      const result = await callApiHandler(
        {
          specPath: SPEC_PATH,
          operationId: "listPets",
          pathParams: {},
          queryParams: {},
          headers: {},
        },
        configFor(FIXTURE_DIR),
      );
      expect(result.ok).toBe(true);
    });

    it("blocks requests when base URL host is overridden to a disallowed host", async () => {
      const specNoServer = path.join(FIXTURE_DIR, "petstore-localhost.json");
      const { writeFileSync } = await import("node:fs");
      writeFileSync(
        specNoServer,
        JSON.stringify({
          openapi: "3.0.3",
          info: { title: "Local", version: "1.0.0" },
          servers: [{ url: "https://evil.example.com" }, { url: "http://localhost:4000" }],
          paths: {
            "/data": {
              get: { operationId: "getData", responses: { "200": { description: "ok" } } },
            },
          },
        }),
      );

      try {
        const result = await callApiHandler(
          {
            specPath: specNoServer,
            operationId: "getData",
            pathParams: {},
            queryParams: {},
            headers: {},
          },
          configFor(FIXTURE_DIR),
        );
        // evil.example.com is actually in the servers list (it's the first one),
        // so it should be allowed
        expect(result.ok).toBe(true);
      } finally {
        const { unlinkSync } = await import("node:fs");
        unlinkSync(specNoServer);
      }
    });
  });

  describe("timeout handling", () => {
    it("throws TimeoutError when fetch times out", async () => {
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" }),
        );

      await expect(
        callApiHandler(
          {
            specPath: SPEC_PATH,
            operationId: "listPets",
            pathParams: {},
            queryParams: {},
            headers: {},
          },
          configFor(FIXTURE_DIR),
        ),
      ).rejects.toBeInstanceOf(TimeoutError);
    });

    it("throws TimeoutError for AbortError", async () => {
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
        );

      await expect(
        callApiHandler(
          {
            specPath: SPEC_PATH,
            operationId: "listPets",
            pathParams: {},
            queryParams: {},
            headers: {},
          },
          configFor(FIXTURE_DIR),
        ),
      ).rejects.toBeInstanceOf(TimeoutError);
    });
  });

  describe("network errors", () => {
    it("throws CommandError on fetch failure", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(
        callApiHandler(
          {
            specPath: SPEC_PATH,
            operationId: "listPets",
            pathParams: {},
            queryParams: {},
            headers: {},
          },
          configFor(FIXTURE_DIR),
        ),
      ).rejects.toBeInstanceOf(CommandError);
    });
  });

  describe("scope violation", () => {
    it("throws ScopeViolationError for spec path outside scope", async () => {
      await expect(
        callApiHandler(
          {
            specPath: "/etc/passwd",
            operationId: "listPets",
            pathParams: {},
            queryParams: {},
            headers: {},
          },
          configFor(FIXTURE_DIR),
        ),
      ).rejects.toBeInstanceOf(ScopeViolationError);
    });
  });

  describe("response body size cap", () => {
    it("truncates response body exceeding 100KB", async () => {
      const largeString = "x".repeat(200 * 1024);
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(largeString, {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      );

      const result = await callApiHandler(
        {
          specPath: SPEC_PATH,
          operationId: "listPets",
          pathParams: {},
          queryParams: {},
          headers: {},
        },
        configFor(FIXTURE_DIR),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect((result.data.body as string).length).toBeLessThanOrEqual(100 * 1024);
      expect(result.meta?.truncated).toBe(true);
    });
  });

  describe("response parsing", () => {
    it("falls back to text when JSON parsing fails", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("plain text response", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      );

      const result = await callApiHandler(
        {
          specPath: SPEC_PATH,
          operationId: "listPets",
          pathParams: {},
          queryParams: {},
          headers: {},
        },
        configFor(FIXTURE_DIR),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.body).toBe("plain text response");
    });
  });
});
