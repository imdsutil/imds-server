import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCli, loadConfig } from "../../../src/config/loader.js";
import defaults from "../../../src/config/defaults.js";

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

  describe("loadConfig", () => {
    it("returns defaults when no CLI values provided", () => {
      const config = loadConfig({});
      assert.deepStrictEqual(config, defaults);
    });

    it("returns a frozen object", () => {
      const config = loadConfig({});
      assert.ok(Object.isFrozen(config));
    });

    it("merges CLI port over default", () => {
      const config = loadConfig({ port: "8080" });
      assert.equal(config.port, 8080);
      assert.equal(config.host, defaults.host);
    });

    it("merges CLI host over default", () => {
      const config = loadConfig({ host: "0.0.0.0" });
      assert.equal(config.host, "0.0.0.0");
      assert.equal(config.port, defaults.port);
    });

    it("merges CLI log-level with coercion to lowercase", () => {
      const config = loadConfig({ "log-level": "DEBUG" });
      assert.equal(config.logLevel, "debug");
    });

    it("merges CLI token-ttl with number coercion", () => {
      const config = loadConfig({ "token-ttl": "300" });
      assert.equal(config.tokenTtl, 300);
    });

    it("merges CLI socket", () => {
      const config = loadConfig({ socket: "/tmp/imds.sock" });
      assert.equal(config.socket, "/tmp/imds.sock");
    });

    it("throws on invalid port", () => {
      assert.throws(() => loadConfig({ port: "99999" }), /port must be an integer/);
    });

    it("throws on invalid log level", () => {
      assert.throws(() => loadConfig({ "log-level": "verbose" }), /logLevel must be one of/);
    });

    it("throws when socket and host are both set", () => {
      assert.throws(
        () => loadConfig({ socket: "/tmp/imds.sock", host: "0.0.0.0" }),
        /mutually exclusive/,
      );
    });

    it("throws when socket and port are both set", () => {
      assert.throws(
        () => loadConfig({ socket: "/tmp/imds.sock", port: "8080" }),
        /mutually exclusive/,
      );
    });

    it("allows socket without host/port flags", () => {
      const config = loadConfig({ socket: "/tmp/imds.sock" });
      assert.equal(config.socket, "/tmp/imds.sock");
    });

    it("ignores help and version flags", () => {
      const config = loadConfig({ help: true });
      assert.ok(!("help" in config) || config.help === undefined);
    });
  });
});
