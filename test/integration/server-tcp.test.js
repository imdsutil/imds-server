import { describe, it, afterEach } from "node:test";
import { request } from "node:http";
import assert from "node:assert/strict";
import { createImdsServer } from "../../src/server/create-server.js";
import { withMiddleware } from "../../src/server/middleware.js";
import { createLogger } from "../../src/util/logger.js";

// Silence log output during tests
const logger = createLogger("error");

function placeholder(req, res) {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OK\n");
}

function httpGet(port, path = "/") {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("TCP server (integration)", () => {
  let closeFn;

  afterEach(async () => {
    if (closeFn) {
      await closeFn();
      closeFn = null;
    }
  });

  it("starts and responds to HTTP requests", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null };
    const handler = withMiddleware(placeholder, logger);
    const { start, close, server } = createImdsServer(config, handler, logger);
    closeFn = close;

    await start();
    const port = server.address().port;

    const res = await httpGet(port);
    assert.equal(res.status, 200);
    assert.equal(res.body, "OK\n");
  });

  it("uses port 0 for OS-assigned port", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null };
    const handler = withMiddleware(placeholder, logger);
    const { start, close, server } = createImdsServer(config, handler, logger);
    closeFn = close;

    await start();
    const port = server.address().port;
    assert.ok(port > 0, "OS should assign a real port");
  });

  it("binds to the specified host", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null };
    const handler = withMiddleware(placeholder, logger);
    const { start, close, server } = createImdsServer(config, handler, logger);
    closeFn = close;

    await start();
    const addr = server.address();
    assert.equal(addr.address, "127.0.0.1");
  });

  it("stops accepting connections after close", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null };
    const handler = withMiddleware(placeholder, logger);
    const { start, close, server } = createImdsServer(config, handler, logger);

    await start();
    const port = server.address().port;
    await close();
    closeFn = null;

    await assert.rejects(() => httpGet(port), /ECONNREFUSED/);
  });

  it("returns 500 when handler throws", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null };
    function brokenHandler() {
      throw new Error("boom");
    }
    const handler = withMiddleware(brokenHandler, logger);
    const { start, close, server } = createImdsServer(config, handler, logger);
    closeFn = close;

    await start();
    const port = server.address().port;

    const res = await httpGet(port);
    assert.equal(res.status, 500);
    assert.equal(res.body, "Internal Server Error\n");
  });

  it("returns 500 when async handler rejects", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null };
    async function brokenHandler() {
      throw new Error("async boom");
    }
    const handler = withMiddleware(brokenHandler, logger);
    const { start, close, server } = createImdsServer(config, handler, logger);
    closeFn = close;

    await start();
    const port = server.address().port;

    const res = await httpGet(port);
    assert.equal(res.status, 500);
    assert.equal(res.body, "Internal Server Error\n");
  });

  it("rejects on port conflict", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null };
    const handler = withMiddleware(placeholder, logger);
    const first = createImdsServer(config, handler, logger);
    await first.start();
    closeFn = first.close;

    const port = first.server.address().port;
    const conflicting = { port, host: "127.0.0.1", socket: null };
    const second = createImdsServer(conflicting, handler, logger);

    await assert.rejects(() => second.start(), /EADDRINUSE/);
  });
});
