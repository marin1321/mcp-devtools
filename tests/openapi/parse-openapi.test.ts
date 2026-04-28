import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseOpenApiHandler } from "../../src/tools/openapi/parse-openapi.js";
import { McpDevtoolsConfigSchema } from "../../src/types/config.js";
import { FileSystemError, ScopeViolationError, ValidationError } from "../../src/types/errors.js";
import { createScopeFixture, type ScopeFixture } from "../fixtures/scope/setup.js";

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures/openapi");

function configFor(scope: string) {
  return McpDevtoolsConfigSchema.parse({ scope });
}

function seedFixture(fixture: ScopeFixture, fixtureFile: string, destName?: string): void {
  const src = path.join(FIXTURES, fixtureFile);
  const dest = path.join(fixture.root, destName ?? fixtureFile);
  const destDir = path.dirname(dest);
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);
}

describe("parseOpenApiHandler", () => {
  let fixture: ScopeFixture;

  beforeEach(() => {
    fixture = createScopeFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("parses a valid JSON OpenAPI 3.x spec", async () => {
    seedFixture(fixture, "petstore.json");

    const result = await parseOpenApiHandler({ path: "petstore.json" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.title).toBe("Petstore");
    expect(result.data.version).toBe("1.0.0");
    expect(result.data.servers).toEqual([
      "https://api.petstore.example.com/v1",
      "https://staging.petstore.example.com/v1",
    ]);
    expect(result.data.operations).toHaveLength(4);
    expect(result.data.operations[0]).toMatchObject({
      operationId: "listPets",
      method: "GET",
      path: "/pets",
      summary: "List all pets",
      tags: ["pets"],
    });
  });

  it("parses a valid YAML spec", async () => {
    seedFixture(fixture, "petstore.yaml");

    const result = await parseOpenApiHandler({ path: "petstore.yaml" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.title).toBe("Petstore YAML");
    expect(result.data.version).toBe("2.0.0");
    expect(result.data.servers).toEqual(["https://yaml.petstore.example.com/v2"]);
    expect(result.data.operations).toHaveLength(2);
    expect(result.data.operations.map((o) => o.operationId)).toEqual([
      "listAnimals",
      "createAnimal",
    ]);
  });

  it("auto-generates operationId when missing", async () => {
    seedFixture(fixture, "no-operation-ids.json");

    const result = await parseOpenApiHandler(
      { path: "no-operation-ids.json" },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.operations).toHaveLength(3);
    expect(result.data.operations.map((o) => o.operationId)).toEqual([
      "GET_/users",
      "POST_/users",
      "GET_/health",
    ]);
  });

  it("handles Swagger 2.0 specs with host/basePath/schemes", async () => {
    seedFixture(fixture, "swagger2.json");

    const result = await parseOpenApiHandler({ path: "swagger2.json" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.title).toBe("Legacy Swagger API");
    expect(result.data.version).toBe("1.2.3");
    expect(result.data.servers).toEqual([
      "https://legacy.example.com/api",
      "http://legacy.example.com/api",
    ]);
    expect(result.data.operations).toHaveLength(1);
    expect(result.data.operations[0]).toMatchObject({
      operationId: "getItems",
      method: "GET",
      path: "/items",
    });
  });

  it("throws ScopeViolationError for paths outside scope", async () => {
    await expect(
      parseOpenApiHandler({ path: "/etc/passwd" }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("throws FileSystemError when spec file does not exist", async () => {
    await expect(
      parseOpenApiHandler({ path: "nonexistent.json" }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(FileSystemError);
  });

  it("throws ValidationError for an invalid spec", async () => {
    seedFixture(fixture, "invalid.json");

    await expect(
      parseOpenApiHandler({ path: "invalid.json" }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("includes summary and tags only when present", async () => {
    seedFixture(fixture, "petstore.json");

    const result = await parseOpenApiHandler({ path: "petstore.json" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const deletePet = result.data.operations.find((o) => o.operationId === "deletePet");
    expect(deletePet).toBeDefined();
    expect(deletePet!.summary).toBeUndefined();
    expect(deletePet!.tags).toEqual(["pets"]);
  });

  it("works with .yml extension", async () => {
    seedFixture(fixture, "petstore.yaml", "spec.yml");

    const result = await parseOpenApiHandler({ path: "spec.yml" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.title).toBe("Petstore YAML");
  });
});
