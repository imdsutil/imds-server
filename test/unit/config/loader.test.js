import { describe, it } from "node:test";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { parseCli, loadConfig, loadConfigFile } from "../../../src/config/loader.js";
import defaults from "../../../src/config/defaults.js";

const cleanEnv = {};

describe("config/loader", () => {
  describe("parseCli", () => {
    it("parses --port flag", () => {
      const values = parseCli(["--port", "8080"]);
      assert.equal(values.port, "8080");
    });

    it("parses --host flag", () => {
      const values = parseCli(["--host", "0.0.0.0"]);
      assert.equal(values.host, "0.0.0.0");
    });

    it("parses --log-level flag", () => {
      const values = parseCli(["--log-level", "debug"]);
      assert.equal(values["log-level"], "debug");
    });

    it("parses --socket flag", () => {
      const values = parseCli(["--socket", "/tmp/imds.sock"]);
      assert.equal(values.socket, "/tmp/imds.sock");
    });

    it("parses --help as boolean", () => {
      const values = parseCli(["--help"]);
      assert.equal(values.help, true);
    });

    it("parses -h shorthand", () => {
      const values = parseCli(["-h"]);
      assert.equal(values.help, true);
    });

    it("parses -v shorthand", () => {
      const values = parseCli(["-v"]);
      assert.equal(values.version, true);
    });

    it("parses multiple flags", () => {
      const values = parseCli(["--port", "3000", "--host", "0.0.0.0", "--log-level", "warn"]);
      assert.equal(values.port, "3000");
      assert.equal(values.host, "0.0.0.0");
      assert.equal(values["log-level"], "warn");
    });

    it("throws on unknown flags", () => {
      assert.throws(() => parseCli(["--bogus"]), /Unknown option/);
    });

    it("returns empty object for no args", () => {
      const values = parseCli([]);
      assert.equal(Object.keys(values).length, 0);
    });
  });

  describe("loadConfig - CLI layer", () => {
    it("returns defaults when no CLI values provided", () => {
      const config = loadConfig({}, cleanEnv);
      assert.deepStrictEqual(config, defaults);
    });

    it("returns a frozen object", () => {
      const config = loadConfig({}, cleanEnv);
      assert.ok(Object.isFrozen(config));
    });

    it("merges CLI port over default", () => {
      const config = loadConfig({ port: "8080" }, cleanEnv);
      assert.equal(config.port, 8080);
      assert.equal(config.host, defaults.host);
    });

    it("merges CLI host over default", () => {
      const config = loadConfig({ host: "0.0.0.0" }, cleanEnv);
      assert.equal(config.host, "0.0.0.0");
      assert.equal(config.port, defaults.port);
    });

    it("merges CLI log-level with coercion to lowercase", () => {
      const config = loadConfig({ "log-level": "DEBUG" }, cleanEnv);
      assert.equal(config.logLevel, "debug");
    });

    it("merges CLI token-ttl with number coercion", () => {
      const config = loadConfig({ "token-ttl": "300" }, cleanEnv);
      assert.equal(config.tokenTtl, 300);
    });

    it("merges CLI socket", () => {
      const config = loadConfig({ socket: "/tmp/imds.sock" }, cleanEnv);
      assert.equal(config.socket, "/tmp/imds.sock");
    });

    it("throws on invalid port", () => {
      assert.throws(() => loadConfig({ port: "99999" }, cleanEnv), /port must be an integer/);
    });

    it("throws on invalid log level", () => {
      assert.throws(
        () => loadConfig({ "log-level": "verbose" }, cleanEnv),
        /logLevel must be one of/,
      );
    });

    it("throws when socket and host are both set", () => {
      assert.throws(
        () => loadConfig({ socket: "/tmp/imds.sock", host: "0.0.0.0" }, cleanEnv),
        /mutually exclusive/,
      );
    });

    it("throws when socket and port are both set", () => {
      assert.throws(
        () => loadConfig({ socket: "/tmp/imds.sock", port: "8080" }, cleanEnv),
        /mutually exclusive/,
      );
    });

    it("allows socket without host/port flags", () => {
      const config = loadConfig({ socket: "/tmp/imds.sock" }, cleanEnv);
      assert.equal(config.socket, "/tmp/imds.sock");
    });

    it("ignores help and version flags", () => {
      const config = loadConfig({ help: true }, cleanEnv);
      assert.ok(!("help" in config) || config.help === undefined);
    });
  });

  describe("loadConfig - env var layer", () => {
    it("reads IMDS_PORT from env", () => {
      const config = loadConfig({}, { IMDS_PORT: "3000" });
      assert.equal(config.port, 3000);
    });

    it("reads IMDS_HOST from env", () => {
      const config = loadConfig({}, { IMDS_HOST: "0.0.0.0" });
      assert.equal(config.host, "0.0.0.0");
    });

    it("reads IMDS_LOG_LEVEL from env", () => {
      const config = loadConfig({}, { IMDS_LOG_LEVEL: "warn" });
      assert.equal(config.logLevel, "warn");
    });

    it("reads IMDS_SOCKET from env", () => {
      const config = loadConfig({}, { IMDS_SOCKET: "/tmp/imds.sock" });
      assert.equal(config.socket, "/tmp/imds.sock");
    });

    it("reads IMDS_TOKEN_TTL from env", () => {
      const config = loadConfig({}, { IMDS_TOKEN_TTL: "600" });
      assert.equal(config.tokenTtl, 600);
    });

    it("ignores unrelated env vars", () => {
      const config = loadConfig({}, { SOME_OTHER_VAR: "whatever" });
      assert.deepStrictEqual(config, defaults);
    });

    it("env vars override defaults", () => {
      const config = loadConfig({}, { IMDS_PORT: "9090" });
      assert.equal(config.port, 9090);
    });

    it("CLI overrides env vars", () => {
      const config = loadConfig({ port: "8080" }, { IMDS_PORT: "9090" });
      assert.equal(config.port, 8080);
    });

    it("detects mutual exclusion across env vars", () => {
      assert.throws(
        () => loadConfig({}, { IMDS_SOCKET: "/tmp/imds.sock", IMDS_PORT: "8080" }),
        /mutually exclusive/,
      );
    });

    it("detects mutual exclusion across CLI and env", () => {
      assert.throws(
        () => loadConfig({ socket: "/tmp/imds.sock" }, { IMDS_PORT: "8080" }),
        /mutually exclusive/,
      );
    });
  });

  describe("loadConfigFile", () => {
    let tmpDir;

    function setup() {
      tmpDir = mkdtempSync(join(tmpdir(), "imds-test-"));
    }

    function teardown() {
      rmSync(tmpDir, { recursive: true });
    }

    it("parses a valid YAML config file", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(filePath, "port: 3000\nlogLevel: debug\n");
        const result = loadConfigFile(filePath);
        assert.equal(result.port, 3000);
        assert.equal(result.logLevel, "debug");
      } finally {
        teardown();
      }
    });

    it("returns empty object for empty file", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(filePath, "");
        const result = loadConfigFile(filePath);
        assert.deepStrictEqual(result, {});
      } finally {
        teardown();
      }
    });

    it("ignores unknown keys", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(filePath, "port: 3000\nunknownKey: value\n");
        const result = loadConfigFile(filePath);
        assert.equal(result.port, 3000);
        assert.ok(!("unknownKey" in result));
      } finally {
        teardown();
      }
    });

    it("throws on missing file", () => {
      assert.throws(() => loadConfigFile("/nonexistent/config.yml"), /Config file not found/);
    });

    it("throws on invalid YAML", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(filePath, "port: [\ninvalid yaml");
        assert.throws(() => loadConfigFile(filePath), /Invalid YAML/);
      } finally {
        teardown();
      }
    });

    it("throws when file contains a non-mapping type", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(filePath, "- item1\n- item2\n");
        assert.throws(() => loadConfigFile(filePath), /must contain a YAML mapping/);
      } finally {
        teardown();
      }
    });

    it("coerces values through the schema", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(filePath, 'port: "8080"\n');
        const result = loadConfigFile(filePath);
        assert.equal(result.port, 8080);
        assert.equal(typeof result.port, "number");
      } finally {
        teardown();
      }
    });
  });

  describe("loadConfig - config file layer", () => {
    let tmpDir;

    function setup() {
      tmpDir = mkdtempSync(join(tmpdir(), "imds-test-"));
    }

    function teardown() {
      rmSync(tmpDir, { recursive: true });
    }

    it("loads config from file specified by CLI --config", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(filePath, "port: 4000\n");
        const config = loadConfig({ config: filePath }, cleanEnv);
        assert.equal(config.port, 4000);
      } finally {
        teardown();
      }
    });

    it("loads config from file specified by IMDS_CONFIG_FILE env var", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(filePath, "port: 4000\n");
        const config = loadConfig({}, { IMDS_CONFIG_FILE: filePath });
        assert.equal(config.port, 4000);
      } finally {
        teardown();
      }
    });

    it("CLI --config takes priority over IMDS_CONFIG_FILE", () => {
      setup();
      try {
        const cliFile = join(tmpDir, "cli.yml");
        const envFile = join(tmpDir, "env.yml");
        writeFileSync(cliFile, "port: 1111\n");
        writeFileSync(envFile, "port: 2222\n");
        const config = loadConfig({ config: cliFile }, { IMDS_CONFIG_FILE: envFile });
        assert.equal(config.port, 1111);
      } finally {
        teardown();
      }
    });

    it("config file values override defaults", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(filePath, "logLevel: debug\n");
        const config = loadConfig({ config: filePath }, cleanEnv);
        assert.equal(config.logLevel, "debug");
      } finally {
        teardown();
      }
    });

    it("env vars override config file values", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(filePath, "port: 4000\n");
        const config = loadConfig({}, { IMDS_CONFIG_FILE: filePath, IMDS_PORT: "5000" });
        assert.equal(config.port, 5000);
      } finally {
        teardown();
      }
    });

    it("CLI overrides config file values", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(filePath, "port: 4000\n");
        const config = loadConfig({ config: filePath, port: "6000" }, cleanEnv);
        assert.equal(config.port, 6000);
      } finally {
        teardown();
      }
    });

    it("throws when --config points to missing file", () => {
      assert.throws(
        () => loadConfig({ config: "/nonexistent/config.yml" }, cleanEnv),
        /Config file not found/,
      );
    });

    it("detects mutual exclusion from config file keys", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(filePath, "socket: /tmp/imds.sock\nport: 8080\n");
        assert.throws(() => loadConfig({ config: filePath }, cleanEnv), /mutually exclusive/);
      } finally {
        teardown();
      }
    });
  });

  describe("loadConfig - handlers", () => {
    let tmpDir;

    function setup() {
      tmpDir = mkdtempSync(join(tmpdir(), "imds-test-"));
    }

    function teardown() {
      rmSync(tmpDir, { recursive: true });
    }

    it("defaults to empty handlers array when no config file", () => {
      const config = loadConfig({}, cleanEnv);
      assert.deepEqual(config.handlers, []);
    });

    it("loads handlers from config file", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(
          filePath,
          [
            "handlers:",
            "  - command: /usr/bin/aws-handler",
            "    types:",
            "      - credentials",
            "  - command: /usr/bin/fallback",
            "    types:",
            "      - credentials",
            "      - region",
            "",
          ].join("\n"),
        );
        const config = loadConfig({ config: filePath }, cleanEnv);
        assert.equal(config.handlers.length, 2);
        assert.equal(config.handlers[0].command, "/usr/bin/aws-handler");
        assert.deepEqual(config.handlers[0].types, ["credentials"]);
        assert.equal(config.handlers[1].command, "/usr/bin/fallback");
        assert.deepEqual(config.handlers[1].types, ["credentials", "region"]);
      } finally {
        teardown();
      }
    });

    it("loads handler with timeout override", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(
          filePath,
          [
            "handlers:",
            "  - command: /usr/bin/slow-handler",
            "    types:",
            "      - credentials",
            "    timeout: 15000",
            "",
          ].join("\n"),
        );
        const config = loadConfig({ config: filePath }, cleanEnv);
        assert.equal(config.handlers[0].timeout, 15000);
      } finally {
        teardown();
      }
    });

    it("rejects invalid handler in config file", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(
          filePath,
          ["handlers:", "  - command: /usr/bin/handler", "    types: []", ""].join("\n"),
        );
        assert.throws(
          () => loadConfig({ config: filePath }, cleanEnv),
          /handlers\[0\]\.types must be a non-empty array/,
        );
      } finally {
        teardown();
      }
    });

    it("defaults to empty array when config file has no handlers key", () => {
      setup();
      try {
        const filePath = join(tmpDir, "config.yml");
        writeFileSync(filePath, "port: 3000\n");
        const config = loadConfig({ config: filePath }, cleanEnv);
        assert.deepEqual(config.handlers, []);
      } finally {
        teardown();
      }
    });
  });
});
