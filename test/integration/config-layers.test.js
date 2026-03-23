import { describe, it } from "node:test";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { parseCli, loadConfig } from "../../src/config/loader.js";
import defaults from "../../src/config/defaults.js";

describe("config layer priority (integration)", () => {
  let tmpDir;

  function setup() {
    tmpDir = mkdtempSync(join(tmpdir(), "imds-integration-"));
  }

  function teardown() {
    rmSync(tmpDir, { recursive: true });
  }

  it("defaults are used when no other sources provide values", () => {
    const cliValues = parseCli([]);
    const config = loadConfig(cliValues, {});
    assert.deepStrictEqual(config, defaults);
  });

  it("config file overrides defaults", () => {
    setup();
    try {
      const configPath = join(tmpDir, "config.yml");
      writeFileSync(configPath, "port: 3000\nlogLevel: debug\n");

      const cliValues = parseCli(["--config", configPath]);
      const config = loadConfig(cliValues, {});

      assert.equal(config.port, 3000);
      assert.equal(config.logLevel, "debug");
      assert.equal(config.host, defaults.host);
    } finally {
      teardown();
    }
  });

  it("env vars override config file values", () => {
    setup();
    try {
      const configPath = join(tmpDir, "config.yml");
      writeFileSync(configPath, "port: 3000\nlogLevel: debug\n");

      const cliValues = parseCli(["--config", configPath]);
      const config = loadConfig(cliValues, { IMDS_PORT: "4000" });

      assert.equal(config.port, 4000, "env var should override config file");
      assert.equal(
        config.logLevel,
        "debug",
        "config file should still apply for non-overridden keys",
      );
    } finally {
      teardown();
    }
  });

  it("CLI args override all other layers", () => {
    setup();
    try {
      const configPath = join(tmpDir, "config.yml");
      writeFileSync(configPath, "port: 3000\nlogLevel: debug\nhost: 10.0.0.1\n");

      const cliValues = parseCli(["--config", configPath, "--port", "5000"]);
      const config = loadConfig(cliValues, { IMDS_LOG_LEVEL: "warn" });

      assert.equal(config.port, 5000, "CLI should override all");
      assert.equal(config.logLevel, "warn", "env should override file");
      assert.equal(config.host, "10.0.0.1", "config file should apply for non-overridden keys");
    } finally {
      teardown();
    }
  });

  it("full 4-layer precedence: CLI > env > file > defaults", () => {
    setup();
    try {
      const configPath = join(tmpDir, "config.yml");
      writeFileSync(
        configPath,
        ["port: 1111", "logLevel: debug", "tokenTtl: 600", "host: 10.0.0.1"].join("\n") + "\n",
      );

      const cliValues = parseCli(["--config", configPath, "--port", "2222"]);
      const env = { IMDS_LOG_LEVEL: "warn" };
      const config = loadConfig(cliValues, env);

      assert.equal(config.port, 2222, "CLI wins over everything");
      assert.equal(config.logLevel, "warn", "env wins over file");
      assert.equal(config.host, "10.0.0.1", "file wins over default");
      assert.equal(config.tokenTtl, 600, "file wins over default for tokenTtl");
      assert.equal(config.handlerTimeout, defaults.handlerTimeout, "default used when no override");
    } finally {
      teardown();
    }
  });

  it("mutual exclusion is enforced across all layers", () => {
    setup();
    try {
      const configPath = join(tmpDir, "config.yml");
      writeFileSync(configPath, "socket: /tmp/imds.sock\n");

      const cliValues = parseCli(["--config", configPath]);
      assert.throws(() => loadConfig(cliValues, { IMDS_PORT: "8080" }), /mutually exclusive/);
    } finally {
      teardown();
    }
  });

  it("validation runs after all layers are merged", () => {
    setup();
    try {
      const configPath = join(tmpDir, "config.yml");
      writeFileSync(configPath, "port: 99999\n");

      const cliValues = parseCli(["--config", configPath]);
      assert.throws(() => loadConfig(cliValues, {}), /port must be an integer between 1 and 65535/);
    } finally {
      teardown();
    }
  });
});
