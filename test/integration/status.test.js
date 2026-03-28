import { describe, it, afterEach } from "node:test";
import { request } from "node:http";
import assert from "node:assert/strict";
import { createImdsServer } from "../../src/server/create-server.js";
import { withMiddleware, validateTokenRequirement } from "../../src/server/middleware.js";
import { createLogger } from "../../src/util/logger.js";
import { Router } from "../../src/server/router.js";
import { HANDLERS, notFoundHandler } from "../../src/handlers/index.js";
import { TokenStore } from "../../src/session/token-store.js";

const logger = createLogger("error");

function createTestServer(config) {
  const tokenStore = new TokenStore();
  const router = new Router(HANDLERS);

  const routingHandler = async (req, res) => {
    if (req.url.startsWith("/latest")) {
      const tokenError = validateTokenRequirement(req, config, tokenStore);
      if (tokenError) {
        res.writeHead(tokenError, { "Content-Type": "text/plain" });
        res.end(tokenError === 401 ? "Unauthorized\n" : "Forbidden\n");
        return;
      }
    }

    const match = router.match(req.method, req.url);

    if (!match) {
      await notFoundHandler(req, res, { logger, config, tokenStore });
      return;
    }

    if (match.status === 405) {
      res.writeHead(405, { Allow: match.allowed.join(", "), "Content-Type": "text/plain" });
      res.end("Method Not Allowed\n");
      return;
    }

    await match.handler(req, res, {
      logger,
      config,
      tokenStore,
      pathRemainder: match.pathRemainder,
    });
  };

  const handler = withMiddleware(routingHandler, logger);
  const { start, close, server } = createImdsServer(config, handler, logger);
  return { start, close, server };
}

function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("status endpoint", () => {
  let closeFn;

  afterEach(async () => {
    if (closeFn) {
      await closeFn();
      closeFn = null;
    }
  });

  it("GET /status returns 200", async () => {
    const config = {
      port: 0,
      host: "127.0.0.1",
      socket: null,
      imdsVersion: "2",
      tokenRequired: true,
    };
    const { start, close, server } = createTestServer(config);
    closeFn = close;

    await start();
    const port = server.address().port;

    const res = await httpGet(port, "/status");
    assert.equal(res.status, 200);
    assert.equal(res.body, "ok\n");
  });

  it("GET /status does not require an IMDSv2 token", async () => {
    const config = {
      port: 0,
      host: "127.0.0.1",
      socket: null,
      imdsVersion: "2",
      tokenRequired: true,
    };
    const { start, close, server } = createTestServer(config);
    closeFn = close;

    await start();
    const port = server.address().port;

    // No X-Aws-Ec2-Metadata-Token header — should still succeed
    const res = await httpGet(port, "/status");
    assert.equal(res.status, 200);
  });

  it("POST /status returns 405", async () => {
    const config = {
      port: 0,
      host: "127.0.0.1",
      socket: null,
      imdsVersion: "2",
      tokenRequired: true,
    };
    const { start, close, server } = createTestServer(config);
    closeFn = close;

    await start();
    const port = server.address().port;

    const res = await new Promise((resolve, reject) => {
      const req = request(
        { hostname: "127.0.0.1", port, path: "/status", method: "POST" },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve({ status: res.statusCode, body }));
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(res.status, 405);
  });
});
