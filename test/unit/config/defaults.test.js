import { describe, it } from "node:test";
import assert from "node:assert/strict";
import defaults from "../../../src/config/defaults.js";

describe("config/defaults", () => {
  it("exports a frozen object", () => {
    assert.ok(Object.isFrozen(defaults));
  });

  it("cannot be modified", () => {
    assert.throws(() => {
      defaults.port = 9999;
    }, TypeError);
  });

  it("has expected keys", () => {
    const expectedKeys = [
      "host",
      "port",
      "socket",
      "tokenTtl",
      "imdsVersion",
      "configFile",
      "handlers",
      "handlerTimeout",
      "logLevel",
    ];
    assert.deepStrictEqual(Object.keys(defaults).sort(), expectedKeys.sort());
  });

  it("has correct default values", () => {
    assert.equal(defaults.host, "127.0.0.1");
    assert.equal(defaults.port, 80);
    assert.equal(defaults.socket, null);
    assert.equal(defaults.tokenTtl, 21600);
    assert.equal(defaults.imdsVersion, "auto");
    assert.equal(defaults.configFile, "~/.imds-server.yml");
    assert.deepEqual(defaults.handlers, []);
    assert.equal(defaults.handlerTimeout, 5000);
    assert.equal(defaults.logLevel, "info");
  });
});
