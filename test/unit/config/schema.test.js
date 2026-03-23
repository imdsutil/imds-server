import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  schema,
  LOG_LEVELS,
  buildParseArgsOptions,
  extractCliValues,
  extractEnvValues,
  validate,
  validateMutualExclusion,
} from "../../../src/config/schema.js";

describe("config/schema", () => {
  describe("schema definition", () => {
    it("defines all expected config keys", () => {
      const expectedKeys = [
        "host",
        "port",
        "socket",
        "tokenTtl",
        "imdsVersion",
        "configFile",
        "handlerTimeout",
        "logLevel",
      ];
      assert.deepStrictEqual(Object.keys(schema).sort(), expectedKeys.sort());
    });

    it("every entry has required fields", () => {
      for (const [key, def] of Object.entries(schema)) {
        assert.ok(def.type, `${key} missing type`);
        assert.ok(def.cliFlag, `${key} missing cliFlag`);
        assert.ok(def.envVar, `${key} missing envVar`);
        assert.ok(typeof def.coerce === "function", `${key} missing coerce`);
        assert.ok(typeof def.validate === "function", `${key} missing validate`);
      }
    });

    it("all env vars use the IMDS_ prefix", () => {
      for (const [key, def] of Object.entries(schema)) {
        assert.ok(def.envVar.startsWith("IMDS_"), `${key} envVar should start with IMDS_`);
      }
    });
  });

  describe("LOG_LEVELS", () => {
    it("contains the expected levels", () => {
      assert.deepStrictEqual(LOG_LEVELS, ["debug", "info", "warn", "error"]);
    });
  });

  describe("buildParseArgsOptions", () => {
    it("includes help and version flags", () => {
      const options = buildParseArgsOptions();
      assert.deepStrictEqual(options.help, { type: "boolean", short: "h" });
      assert.deepStrictEqual(options.version, { type: "boolean", short: "v" });
    });

    it("includes a flag for every schema key", () => {
      const options = buildParseArgsOptions();
      for (const def of Object.values(schema)) {
        assert.ok(options[def.cliFlag], `missing option for ${def.cliFlag}`);
      }
    });

    it("maps number-typed config keys to string-typed CLI flags", () => {
      const options = buildParseArgsOptions();
      assert.equal(options.port.type, "string");
      assert.equal(options["token-ttl"].type, "string");
      assert.equal(options["handler-timeout"].type, "string");
    });
  });

  describe("extractCliValues", () => {
    it("maps CLI flag names to config keys with coercion", () => {
      const result = extractCliValues({ port: "8080", "log-level": "DEBUG" });
      assert.equal(result.port, 8080);
      assert.equal(result.logLevel, "debug");
    });

    it("ignores unknown flags", () => {
      const result = extractCliValues({ help: true, port: "80" });
      assert.equal(result.port, 80);
      assert.ok(!("help" in result));
    });

    it("returns empty object when no flags match", () => {
      const result = extractCliValues({});
      assert.deepStrictEqual(result, {});
    });
  });

  describe("extractEnvValues", () => {
    it("extracts known IMDS_ env vars with coercion", () => {
      const result = extractEnvValues({ IMDS_PORT: "3000", IMDS_LOG_LEVEL: "WARN" });
      assert.equal(result.port, 3000);
      assert.equal(result.logLevel, "warn");
    });

    it("ignores non-IMDS env vars", () => {
      const result = extractEnvValues({ PATH: "/usr/bin", HOME: "/home/user" });
      assert.deepStrictEqual(result, {});
    });

    it("returns empty object for empty env", () => {
      const result = extractEnvValues({});
      assert.deepStrictEqual(result, {});
    });

    it("extracts string values without coercion issues", () => {
      const result = extractEnvValues({ IMDS_HOST: "10.0.0.1", IMDS_SOCKET: "/tmp/test.sock" });
      assert.equal(result.host, "10.0.0.1");
      assert.equal(result.socket, "/tmp/test.sock");
    });
  });

  describe("validate", () => {
    it("accepts a valid config", () => {
      assert.doesNotThrow(() =>
        validate({
          host: "127.0.0.1",
          port: 8080,
          socket: null,
          tokenTtl: 300,
          imdsVersion: "auto",
          configFile: null,
          handlerTimeout: 5000,
          logLevel: "info",
        }),
      );
    });

    it("rejects port out of range", () => {
      assert.throws(
        () =>
          validate({
            host: "127.0.0.1",
            port: 99999,
            socket: null,
            tokenTtl: 300,
            imdsVersion: "auto",
            configFile: null,
            handlerTimeout: 5000,
            logLevel: "info",
          }),
        /port must be an integer between 1 and 65535/,
      );
    });

    it("rejects non-integer port", () => {
      assert.throws(
        () =>
          validate({
            host: "127.0.0.1",
            port: 80.5,
            socket: null,
            tokenTtl: 300,
            imdsVersion: "auto",
            configFile: null,
            handlerTimeout: 5000,
            logLevel: "info",
          }),
        /port must be an integer/,
      );
    });

    it("rejects invalid log level", () => {
      assert.throws(
        () =>
          validate({
            host: "127.0.0.1",
            port: 80,
            socket: null,
            tokenTtl: 300,
            imdsVersion: "auto",
            configFile: null,
            handlerTimeout: 5000,
            logLevel: "verbose",
          }),
        /logLevel must be one of/,
      );
    });

    it("rejects tokenTtl above 21600", () => {
      assert.throws(
        () =>
          validate({
            host: "127.0.0.1",
            port: 80,
            socket: null,
            tokenTtl: 99999,
            imdsVersion: "auto",
            configFile: null,
            handlerTimeout: 5000,
            logLevel: "info",
          }),
        /tokenTtl must be an integer between 1 and 21600/,
      );
    });

    it("rejects empty host string", () => {
      assert.throws(
        () =>
          validate({
            host: "",
            port: 80,
            socket: null,
            tokenTtl: 300,
            imdsVersion: "auto",
            configFile: null,
            handlerTimeout: 5000,
            logLevel: "info",
          }),
        /host must be a non-empty string/,
      );
    });

    it("skips validation for null values", () => {
      assert.doesNotThrow(() =>
        validate({
          host: "127.0.0.1",
          port: 80,
          socket: null,
          tokenTtl: 300,
          imdsVersion: "auto",
          configFile: null,
          handlerTimeout: 5000,
          logLevel: "info",
        }),
      );
    });
  });

  describe("validateMutualExclusion", () => {
    it("allows socket alone", () => {
      assert.doesNotThrow(() => validateMutualExclusion(new Set(["socket"])));
    });

    it("allows host and port together", () => {
      assert.doesNotThrow(() => validateMutualExclusion(new Set(["host", "port"])));
    });

    it("rejects socket with host", () => {
      assert.throws(
        () => validateMutualExclusion(new Set(["socket", "host"])),
        /mutually exclusive/,
      );
    });

    it("rejects socket with port", () => {
      assert.throws(
        () => validateMutualExclusion(new Set(["socket", "port"])),
        /mutually exclusive/,
      );
    });

    it("allows unrelated keys alongside socket", () => {
      assert.doesNotThrow(() => validateMutualExclusion(new Set(["socket", "logLevel"])));
    });
  });
});
