import { test } from "node:test";
import assert from "node:assert";
import { Router } from "../../../src/server/router.js";

const mockHandler = async () => {};
const mockHandler2 = async () => {};

test("Router: exact path match", () => {
  const router = new Router([{ method: "GET", path: "/latest/meta-data", handler: mockHandler }]);

  const match = router.match("GET", "/latest/meta-data");
  assert.ok(match);
  assert.strictEqual(match.pathRemainder, "");
  assert.strictEqual(match.handler, mockHandler);
});

test("Router: path with remainder", () => {
  const router = new Router([{ method: "GET", path: "/latest/meta-data", handler: mockHandler }]);

  const match = router.match("GET", "/latest/meta-data/instance-id");
  assert.ok(match);
  assert.strictEqual(match.pathRemainder, "/instance-id");
  assert.strictEqual(match.handler, mockHandler);
});

test("Router: longest prefix wins", () => {
  const router = new Router([
    { method: "GET", path: "/latest", handler: mockHandler },
    { method: "GET", path: "/latest/meta-data", handler: mockHandler2 },
  ]);

  const match = router.match("GET", "/latest/meta-data/instance-id");
  assert.ok(match);
  assert.strictEqual(match.handler, mockHandler2);
  assert.strictEqual(match.pathRemainder, "/instance-id");
});

test("Router: 404 for unknown path", () => {
  const router = new Router([{ method: "GET", path: "/latest/meta-data", handler: mockHandler }]);

  const match = router.match("GET", "/unknown");
  assert.strictEqual(match, null);
});

test("Router: 405 for wrong method", () => {
  const router = new Router([{ method: "GET", path: "/latest/meta-data", handler: mockHandler }]);

  const match = router.match("POST", "/latest/meta-data");
  assert.ok(match);
  assert.strictEqual(match.status, 405);
  assert.deepStrictEqual(match.allowed, ["GET"]);
});

test("Router: 405 with multiple allowed methods", () => {
  const router = new Router([
    { method: "GET", path: "/latest/meta-data", handler: mockHandler },
    { method: "HEAD", path: "/latest/meta-data", handler: mockHandler2 },
  ]);

  const match = router.match("POST", "/latest/meta-data");
  assert.ok(match);
  assert.strictEqual(match.status, 405);
  assert.deepStrictEqual(match.allowed, ["GET", "HEAD"]);
});

test("Router: case-sensitive matching", () => {
  const router = new Router([{ method: "GET", path: "/latest/meta-data", handler: mockHandler }]);

  const match = router.match("GET", "/Latest/meta-data");
  assert.strictEqual(match, null);
});

test("Router: longest prefix among candidates with same length", () => {
  const router = new Router([
    { method: "GET", path: "/api/v1", handler: mockHandler },
    { method: "POST", path: "/api/v1", handler: mockHandler2 },
  ]);

  const match = router.match("POST", "/api/v1/resource");
  assert.ok(match);
  assert.strictEqual(match.handler, mockHandler2);
  assert.strictEqual(match.pathRemainder, "/resource");
});

test("Router: no match with path as substring but not prefix", () => {
  const router = new Router([{ method: "GET", path: "/meta-data", handler: mockHandler }]);

  const match = router.match("GET", "/latest-meta-data");
  assert.strictEqual(match, null);
});
