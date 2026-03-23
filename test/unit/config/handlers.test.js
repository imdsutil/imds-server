import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateHandlers } from "../../../src/config/schema.js";

describe("validateHandlers", () => {
  it("accepts an empty array", () => {
    assert.doesNotThrow(() => validateHandlers([]));
  });

  it("accepts a valid handler entry", () => {
    assert.doesNotThrow(() =>
      validateHandlers([{ command: "/usr/bin/handler", types: ["credentials"] }]),
    );
  });

  it("accepts a handler with timeout override", () => {
    assert.doesNotThrow(() =>
      validateHandlers([{ command: "/usr/bin/handler", types: ["credentials"], timeout: 10000 }]),
    );
  });

  it("accepts multiple handlers", () => {
    assert.doesNotThrow(() =>
      validateHandlers([
        { command: "/usr/bin/aws-handler", types: ["credentials"] },
        { command: "/usr/bin/fallback", types: ["credentials", "region", "instance-id"] },
      ]),
    );
  });

  it("rejects non-array handlers", () => {
    assert.throws(() => validateHandlers("not-an-array"), /handlers must be an array/);
  });

  it("rejects handler without command", () => {
    assert.throws(
      () => validateHandlers([{ types: ["credentials"] }]),
      /handlers\[0\]\.command must be a non-empty string/,
    );
  });

  it("rejects handler with empty command", () => {
    assert.throws(
      () => validateHandlers([{ command: "", types: ["credentials"] }]),
      /handlers\[0\]\.command must be a non-empty string/,
    );
  });

  it("rejects handler with non-string command", () => {
    assert.throws(
      () => validateHandlers([{ command: 123, types: ["credentials"] }]),
      /handlers\[0\]\.command must be a non-empty string/,
    );
  });

  it("rejects handler without types", () => {
    assert.throws(
      () => validateHandlers([{ command: "/usr/bin/handler" }]),
      /handlers\[0\]\.types must be a non-empty array of strings/,
    );
  });

  it("rejects handler with empty types array", () => {
    assert.throws(
      () => validateHandlers([{ command: "/usr/bin/handler", types: [] }]),
      /handlers\[0\]\.types must be a non-empty array of strings/,
    );
  });

  it("rejects handler with non-array types", () => {
    assert.throws(
      () => validateHandlers([{ command: "/usr/bin/handler", types: "credentials" }]),
      /handlers\[0\]\.types must be a non-empty array of strings/,
    );
  });

  it("rejects handler with non-string type entry", () => {
    assert.throws(
      () => validateHandlers([{ command: "/usr/bin/handler", types: [123] }]),
      /handlers\[0\]\.types must be a non-empty array of strings/,
    );
  });

  it("rejects handler with timeout below 100", () => {
    assert.throws(
      () =>
        validateHandlers([{ command: "/usr/bin/handler", types: ["credentials"], timeout: 50 }]),
      /handlers\[0\]\.timeout must be an integer between 100 and 30000/,
    );
  });

  it("rejects handler with timeout above 30000", () => {
    assert.throws(
      () =>
        validateHandlers([{ command: "/usr/bin/handler", types: ["credentials"], timeout: 60000 }]),
      /handlers\[0\]\.timeout must be an integer between 100 and 30000/,
    );
  });

  it("rejects handler with non-integer timeout", () => {
    assert.throws(
      () =>
        validateHandlers([
          { command: "/usr/bin/handler", types: ["credentials"], timeout: 5000.5 },
        ]),
      /handlers\[0\]\.timeout must be an integer between 100 and 30000/,
    );
  });

  it("reports correct index for second handler error", () => {
    assert.throws(
      () =>
        validateHandlers([
          { command: "/usr/bin/good", types: ["credentials"] },
          { command: "", types: ["region"] },
        ]),
      /handlers\[1\]\.command/,
    );
  });
});
