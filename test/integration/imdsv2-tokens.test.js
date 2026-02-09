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
    const tokenError = validateTokenRequirement(req, config, tokenStore);
    if (tokenError) {
      res.writeHead(tokenError, { "Content-Type": "text/plain" });
      res.end(tokenError === 401 ? "Unauthorized\n" : "Forbidden\n");
      return;
    }

    const match = router.match(req.method, req.url);

    if (!match) {
      await notFoundHandler(req, res, { logger, config, tokenStore });
      return;
    }

    if (match.status === 405) {
      res.writeHead(405, {
        Allow: match.allowed.join(", "),
        "Content-Type": "text/plain",
      });
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

  return { start, close, server, tokenStore };
}

function httpRequest(port, method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method, headers }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("IMDSv2 Token Flow (integration)", () => {
  let closeFn, tokenStore;

  afterEach(async () => {
    if (tokenStore) {
      tokenStore.close();
      tokenStore = null;
    }
    if (closeFn) {
      await closeFn();
      closeFn = null;
    }
  });

  it("issues tokens via PUT /latest/api/token", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null, imdsVersion: "auto" };
    const testServer = createTestServer(config);
    closeFn = testServer.close;
    tokenStore = testServer.tokenStore;

    await testServer.start();
    const port = testServer.server.address().port;

    const res = await httpRequest(port, "PUT", "/latest/api/token", {
      "X-aws-ec2-metadata-token-ttl-seconds": "300",
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.length > 0, "Token should be returned");
    assert.match(res.body, /^[0-9a-f-]{36}$/, "Token should be a UUID");
  });

  it("rejects token requests without TTL header", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null, imdsVersion: "auto" };
    const testServer = createTestServer(config);
    closeFn = testServer.close;
    tokenStore = testServer.tokenStore;

    await testServer.start();
    const port = testServer.server.address().port;

    const res = await httpRequest(port, "PUT", "/latest/api/token");

    assert.equal(res.status, 400);
    assert.match(res.body, /required/i);
  });

  it("rejects token requests with invalid TTL", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null, imdsVersion: "auto" };
    const testServer = createTestServer(config);
    closeFn = testServer.close;
    tokenStore = testServer.tokenStore;

    await testServer.start();
    const port = testServer.server.address().port;

    const res = await httpRequest(port, "PUT", "/latest/api/token", {
      "X-aws-ec2-metadata-token-ttl-seconds": "99999",
    });

    assert.equal(res.status, 400);
    assert.match(res.body, /TTL/i);
  });

  it("rejects token requests with X-Forwarded-For header", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null, imdsVersion: "auto" };
    const testServer = createTestServer(config);
    closeFn = testServer.close;
    tokenStore = testServer.tokenStore;

    await testServer.start();
    const port = testServer.server.address().port;

    const res = await httpRequest(port, "PUT", "/latest/api/token", {
      "X-aws-ec2-metadata-token-ttl-seconds": "300",
      "X-Forwarded-For": "10.0.0.1",
    });

    assert.equal(res.status, 403);
  });

  it("auto mode: allows tokenless requests initially", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null, imdsVersion: "auto" };
    const testServer = createTestServer(config);
    closeFn = testServer.close;
    tokenStore = testServer.tokenStore;

    await testServer.start();
    const port = testServer.server.address().port;

    // Request without token should succeed initially
    const res = await httpRequest(port, "GET", "/unknown");
    assert.equal(res.status, 404); // 404 not 401, meaning token validation passed
  });

  it("auto mode: requires tokens after first token is created", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null, imdsVersion: "auto" };
    const testServer = createTestServer(config);
    closeFn = testServer.close;
    tokenStore = testServer.tokenStore;

    await testServer.start();
    const port = testServer.server.address().port;

    // Get a token
    const tokenRes = await httpRequest(port, "PUT", "/latest/api/token", {
      "X-aws-ec2-metadata-token-ttl-seconds": "300",
    });
    const token = tokenRes.body.trim();

    // Now tokenless requests should fail
    const noTokenRes = await httpRequest(port, "GET", "/unknown");
    assert.equal(noTokenRes.status, 401);

    // Requests with token should work
    const withTokenRes = await httpRequest(port, "GET", "/unknown", {
      "X-aws-ec2-metadata-token": token,
    });
    assert.equal(withTokenRes.status, 404); // 404 not 401
  });

  it("v2 mode: always requires tokens", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null, imdsVersion: "2" };
    const testServer = createTestServer(config);
    closeFn = testServer.close;
    tokenStore = testServer.tokenStore;

    await testServer.start();
    const port = testServer.server.address().port;

    // Tokenless request should fail
    const noTokenRes = await httpRequest(port, "GET", "/unknown");
    assert.equal(noTokenRes.status, 401);

    // Get a token
    const tokenRes = await httpRequest(port, "PUT", "/latest/api/token", {
      "X-aws-ec2-metadata-token-ttl-seconds": "300",
    });
    const token = tokenRes.body.trim();

    // Request with token should work
    const withTokenRes = await httpRequest(port, "GET", "/unknown", {
      "X-aws-ec2-metadata-token": token,
    });
    assert.equal(withTokenRes.status, 404); // 404 not 401
  });

  it("v1 mode: token endpoint returns 403", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null, imdsVersion: "1" };
    const testServer = createTestServer(config);
    closeFn = testServer.close;
    tokenStore = testServer.tokenStore;

    await testServer.start();
    const port = testServer.server.address().port;

    const res = await httpRequest(port, "PUT", "/latest/api/token", {
      "X-aws-ec2-metadata-token-ttl-seconds": "300",
    });

    assert.equal(res.status, 403);
    assert.match(res.body, /disabled/i);
  });

  it("v1 mode: allows all tokenless requests", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null, imdsVersion: "1" };
    const testServer = createTestServer(config);
    closeFn = testServer.close;
    tokenStore = testServer.tokenStore;

    await testServer.start();
    const port = testServer.server.address().port;

    const res = await httpRequest(port, "GET", "/unknown");
    assert.equal(res.status, 404); // 404 not 401, meaning no token required
  });

  it("rejects expired tokens", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null, imdsVersion: "2" };
    const testServer = createTestServer(config);
    closeFn = testServer.close;
    tokenStore = testServer.tokenStore;

    await testServer.start();
    const port = testServer.server.address().port;

    // Get a token with 1 second TTL
    const tokenRes = await httpRequest(port, "PUT", "/latest/api/token", {
      "X-aws-ec2-metadata-token-ttl-seconds": "1",
    });
    const token = tokenRes.body.trim();

    // Token should work immediately
    const validRes = await httpRequest(port, "GET", "/unknown", {
      "X-aws-ec2-metadata-token": token,
    });
    assert.equal(validRes.status, 404); // 404 not 401

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Token should now be rejected
    const expiredRes = await httpRequest(port, "GET", "/unknown", {
      "X-aws-ec2-metadata-token": token,
    });
    assert.equal(expiredRes.status, 401);
  });

  it("rejects invalid tokens", async () => {
    const config = { port: 0, host: "127.0.0.1", socket: null, imdsVersion: "2" };
    const testServer = createTestServer(config);
    closeFn = testServer.close;
    tokenStore = testServer.tokenStore;

    await testServer.start();
    const port = testServer.server.address().port;

    const res = await httpRequest(port, "GET", "/unknown", {
      "X-aws-ec2-metadata-token": "invalid-token-12345",
    });

    assert.equal(res.status, 401);
  });
});
