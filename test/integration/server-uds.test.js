import { describe, it, afterEach } from "node:test";
import { request } from "node:http";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { createImdsServer } from "../../src/server/create-server.js";
import { withMiddleware } from "../../src/server/middleware.js";
import { createLogger } from "../../src/util/logger.js";

const logger = createLogger("error");

function placeholder(req, res) {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OK\n");
}

function httpGetUds(socketPath, path = "/") {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath, path, method: "GET" }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("UDS server (integration)", () => {
  let tmpDir;
  let closeFn;

  function setup() {
    tmpDir = mkdtempSync(join(tmpdir(), "imds-uds-"));
  }

  afterEach(async () => {
    if (closeFn) {
      await closeFn();
      closeFn = null;
    }
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true });
      tmpDir = null;
    }
  });

  it("starts and responds on a Unix domain socket", async () => {
    setup();
    const socketPath = join(tmpDir, "imds.sock");
    const config = { socket: socketPath, port: 80, host: "127.0.0.1" };
    const handler = withMiddleware(placeholder, logger);
    const { start, close } = createImdsServer(config, handler, logger);
    closeFn = close;

    await start();

    const res = await httpGetUds(socketPath);
    assert.equal(res.status, 200);
    assert.equal(res.body, "OK\n");
  });

  it("creates the socket file on start", async () => {
    setup();
    const socketPath = join(tmpDir, "imds.sock");
    const config = { socket: socketPath, port: 80, host: "127.0.0.1" };
    const handler = withMiddleware(placeholder, logger);
    const { start, close } = createImdsServer(config, handler, logger);
    closeFn = close;

    assert.ok(!existsSync(socketPath), "socket should not exist before start");
    await start();
    assert.ok(existsSync(socketPath), "socket should exist after start");
  });

  it("cleans up stale socket file before starting", async () => {
    setup();
    const socketPath = join(tmpDir, "imds.sock");
    // Create a stale file at the socket path
    writeFileSync(socketPath, "stale");

    const config = { socket: socketPath, port: 80, host: "127.0.0.1" };
    const handler = withMiddleware(placeholder, logger);
    const { start, close } = createImdsServer(config, handler, logger);
    closeFn = close;

    // Should succeed despite the stale file
    await start();
    const res = await httpGetUds(socketPath);
    assert.equal(res.status, 200);
  });

  it("stops accepting connections after close", async () => {
    setup();
    const socketPath = join(tmpDir, "imds.sock");
    const config = { socket: socketPath, port: 80, host: "127.0.0.1" };
    const handler = withMiddleware(placeholder, logger);
    const { start, close } = createImdsServer(config, handler, logger);

    await start();
    await close();
    closeFn = null;

    await assert.rejects(() => httpGetUds(socketPath), /ENOENT|ECONNREFUSED/);
  });
});
