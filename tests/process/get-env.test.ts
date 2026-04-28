import { writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getEnvHandler } from "../../src/tools/process/get-env.js";
import { McpDevtoolsConfigSchema } from "../../src/types/config.js";
import { FileSystemError, ScopeViolationError } from "../../src/types/errors.js";
import { createScopeFixture, type ScopeFixture } from "../fixtures/scope/setup.js";

function configFor(scope: string) {
  return McpDevtoolsConfigSchema.parse({ scope });
}

describe("getEnvHandler", () => {
  let fixture: ScopeFixture;

  beforeEach(() => {
    fixture = createScopeFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe("source=dotenv", () => {
    it("reads variables from a .env file", async () => {
      writeFileSync(path.join(fixture.root, ".env"), "FOO=bar\nBAZ=42\n");

      const result = await getEnvHandler(
        { source: "dotenv", path: ".env", maskSecrets: false },
        configFor(fixture.root),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.variables).toEqual({ FOO: "bar", BAZ: "42" });
    });

    it("returns empty variables for an empty .env file", async () => {
      writeFileSync(path.join(fixture.root, ".env"), "");

      const result = await getEnvHandler(
        { source: "dotenv", path: ".env", maskSecrets: false },
        configFor(fixture.root),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.variables).toEqual({});
    });

    it("throws FileSystemError for a missing .env file", async () => {
      await expect(
        getEnvHandler(
          { source: "dotenv", path: "missing.env", maskSecrets: false },
          configFor(fixture.root),
        ),
      ).rejects.toBeInstanceOf(FileSystemError);
    });

    it("throws ScopeViolationError for a path outside scope", async () => {
      await expect(
        getEnvHandler(
          { source: "dotenv", path: "/etc/passwd", maskSecrets: false },
          configFor(fixture.root),
        ),
      ).rejects.toBeInstanceOf(ScopeViolationError);
    });

    it("reads from a custom path within scope", async () => {
      writeFileSync(path.join(fixture.root, "nested", "config.env"), "APP=test\n");

      const result = await getEnvHandler(
        { source: "dotenv", path: "nested/config.env", maskSecrets: false },
        configFor(fixture.root),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.variables).toEqual({ APP: "test" });
    });
  });

  describe("source=env", () => {
    const injectedKeys = ["MCP_TEST_A", "MCP_TEST_B"];

    beforeEach(() => {
      process.env.MCP_TEST_A = "alpha";
      process.env.MCP_TEST_B = "beta";
    });

    afterEach(() => {
      for (const key of injectedKeys) {
        delete process.env[key];
      }
    });

    it("reads variables from process.env", async () => {
      const result = await getEnvHandler(
        { source: "env", path: ".env", maskSecrets: false },
        configFor(fixture.root),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.variables.MCP_TEST_A).toBe("alpha");
      expect(result.data.variables.MCP_TEST_B).toBe("beta");
    });

    it("filters by keys from process.env", async () => {
      const result = await getEnvHandler(
        { source: "env", path: ".env", keys: ["MCP_TEST_A"], maskSecrets: false },
        configFor(fixture.root),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.variables).toEqual({ MCP_TEST_A: "alpha" });
    });
  });

  describe("key filtering", () => {
    it("returns only requested keys", async () => {
      writeFileSync(path.join(fixture.root, ".env"), "A=1\nB=2\nC=3\n");

      const result = await getEnvHandler(
        { source: "dotenv", path: ".env", keys: ["A", "C"], maskSecrets: false },
        configFor(fixture.root),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.variables).toEqual({ A: "1", C: "3" });
    });

    it("omits keys that do not exist without erroring", async () => {
      writeFileSync(path.join(fixture.root, ".env"), "A=1\n");

      const result = await getEnvHandler(
        { source: "dotenv", path: ".env", keys: ["A", "MISSING"], maskSecrets: false },
        configFor(fixture.root),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.variables).toEqual({ A: "1" });
    });

    it("returns empty when no requested keys exist", async () => {
      writeFileSync(path.join(fixture.root, ".env"), "A=1\n");

      const result = await getEnvHandler(
        { source: "dotenv", path: ".env", keys: ["NOPE"], maskSecrets: false },
        configFor(fixture.root),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.variables).toEqual({});
    });
  });

  describe("secret masking", () => {
    it("masks keys containing PASSWORD", async () => {
      writeFileSync(path.join(fixture.root, ".env"), "DB_PASSWORD=hunter2\n");

      const result = await getEnvHandler(
        { source: "dotenv", path: ".env", maskSecrets: true },
        configFor(fixture.root),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.variables.DB_PASSWORD).toBe("****");
    });

    it("masks multiple secret patterns", async () => {
      const envContent = [
        "MY_SECRET=s1",
        "DB_PASSWORD=s2",
        "MY_PASSWD=s3",
        "ACCESS_TOKEN=s4",
        "SSH_KEY=s5",
        "MY_API_KEY=s6",
        "PRIVATE_DATA=s7",
        "AWS_CREDENTIAL=s8",
        "BASIC_AUTH=s9",
        "MY_APIKEY=s10",
        "SAFE_VAR=visible",
      ].join("\n");
      writeFileSync(path.join(fixture.root, ".env"), envContent);

      const result = await getEnvHandler(
        { source: "dotenv", path: ".env", maskSecrets: true },
        configFor(fixture.root),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const vars = result.data.variables;
      expect(vars.MY_SECRET).toBe("****");
      expect(vars.DB_PASSWORD).toBe("****");
      expect(vars.MY_PASSWD).toBe("****");
      expect(vars.ACCESS_TOKEN).toBe("****");
      expect(vars.SSH_KEY).toBe("****");
      expect(vars.MY_API_KEY).toBe("****");
      expect(vars.PRIVATE_DATA).toBe("****");
      expect(vars.AWS_CREDENTIAL).toBe("****");
      expect(vars.BASIC_AUTH).toBe("****");
      expect(vars.MY_APIKEY).toBe("****");
      expect(vars.SAFE_VAR).toBe("visible");
    });

    it("is case-insensitive for pattern matching", async () => {
      writeFileSync(path.join(fixture.root, ".env"), "my_password=val\nMy_Token=val2\n");

      const result = await getEnvHandler(
        { source: "dotenv", path: ".env", maskSecrets: true },
        configFor(fixture.root),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.variables.my_password).toBe("****");
      expect(result.data.variables.My_Token).toBe("****");
    });

    it("returns raw values when maskSecrets is false", async () => {
      writeFileSync(path.join(fixture.root, ".env"), "DB_PASSWORD=hunter2\nSECRET=abc\n");

      const result = await getEnvHandler(
        { source: "dotenv", path: ".env", maskSecrets: false },
        configFor(fixture.root),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.variables.DB_PASSWORD).toBe("hunter2");
      expect(result.data.variables.SECRET).toBe("abc");
    });
  });

  describe("combined scenarios", () => {
    it("source=dotenv + keys filter + maskSecrets", async () => {
      const envContent = "DB_PASSWORD=hunter2\nAPP_NAME=myapp\nAPI_KEY=abc123\n";
      writeFileSync(path.join(fixture.root, ".env"), envContent);

      const result = await getEnvHandler(
        {
          source: "dotenv",
          path: ".env",
          keys: ["DB_PASSWORD", "APP_NAME"],
          maskSecrets: true,
        },
        configFor(fixture.root),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.variables).toEqual({
        DB_PASSWORD: "****",
        APP_NAME: "myapp",
      });
    });

    it("source=env + keys filter + maskSecrets", async () => {
      process.env.MCP_SECRET_VAL = "hidden";
      process.env.MCP_NORMAL_VAL = "visible";
      try {
        const result = await getEnvHandler(
          {
            source: "env",
            path: ".env",
            keys: ["MCP_SECRET_VAL", "MCP_NORMAL_VAL"],
            maskSecrets: true,
          },
          configFor(fixture.root),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.variables.MCP_SECRET_VAL).toBe("****");
        expect(result.data.variables.MCP_NORMAL_VAL).toBe("visible");
      } finally {
        delete process.env.MCP_SECRET_VAL;
        delete process.env.MCP_NORMAL_VAL;
      }
    });
  });
});
