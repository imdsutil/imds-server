import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createLogger, LEVELS } from "../../../src/util/logger.js";

describe("util/logger", () => {
  let originalWrite;
  let captured;

  beforeEach(() => {
    captured = [];
    originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      captured.push(chunk);
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  describe("LEVELS", () => {
    it("defines expected log levels in ascending severity", () => {
      assert.ok(LEVELS.debug < LEVELS.info);
      assert.ok(LEVELS.info < LEVELS.warn);
      assert.ok(LEVELS.warn < LEVELS.error);
    });
  });

  describe("createLogger", () => {
    it("outputs JSON lines to stdout", () => {
      const logger = createLogger("debug");
      logger.info("test message");
      assert.equal(captured.length, 1);
      const entry = JSON.parse(captured[0]);
      assert.equal(entry.level, "info");
      assert.equal(entry.message, "test message");
    });

    it("includes a timestamp in ISO format", () => {
      const logger = createLogger("debug");
      logger.info("ts check");
      const entry = JSON.parse(captured[0]);
      assert.ok(entry.timestamp);
      assert.doesNotThrow(() => new Date(entry.timestamp));
    });

    it("includes extra fields in the log entry", () => {
      const logger = createLogger("debug");
      logger.info("with extras", { host: "127.0.0.1", port: 8080 });
      const entry = JSON.parse(captured[0]);
      assert.equal(entry.host, "127.0.0.1");
      assert.equal(entry.port, 8080);
    });

    it("appends a newline after each entry", () => {
      const logger = createLogger("debug");
      logger.info("newline check");
      assert.ok(captured[0].endsWith("\n"));
    });
  });

  describe("level filtering", () => {
    it("suppresses debug when logLevel is info", () => {
      const logger = createLogger("info");
      logger.debug("should not appear");
      assert.equal(captured.length, 0);
    });

    it("allows info when logLevel is info", () => {
      const logger = createLogger("info");
      logger.info("should appear");
      assert.equal(captured.length, 1);
    });

    it("allows warn and error when logLevel is info", () => {
      const logger = createLogger("info");
      logger.warn("w");
      logger.error("e");
      assert.equal(captured.length, 2);
    });

    it("suppresses info and debug when logLevel is warn", () => {
      const logger = createLogger("warn");
      logger.debug("no");
      logger.info("no");
      assert.equal(captured.length, 0);
    });

    it("allows all levels when logLevel is debug", () => {
      const logger = createLogger("debug");
      logger.debug("d");
      logger.info("i");
      logger.warn("w");
      logger.error("e");
      assert.equal(captured.length, 4);
    });

    it("only allows error when logLevel is error", () => {
      const logger = createLogger("error");
      logger.debug("no");
      logger.info("no");
      logger.warn("no");
      logger.error("yes");
      assert.equal(captured.length, 1);
    });

    it("defaults to info when given an unknown level", () => {
      const logger = createLogger("bogus");
      logger.debug("suppressed");
      logger.info("visible");
      assert.equal(captured.length, 1);
    });
  });
});
