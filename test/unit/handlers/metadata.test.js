import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMetadataHandler } from "../../../src/handlers/metadata.js";

function stubChain(result) {
  const calls = [];
  return {
    execute: async (requestType, request) => {
      calls.push({ requestType, request });
      return result;
    },
    calls,
  };
}

function mockReq(url, containerInfo = {}) {
  return {
    url,
    containerInfo: {
      id: containerInfo.id ?? "abc123",
      name: containerInfo.name ?? "my-app",
      labels: containerInfo.labels ?? {},
    },
  };
}

function mockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: "",
    writeHead(status, headers) {
      res.statusCode = status;
      res.headers = headers;
    },
    end(body) {
      res.body = body ?? "";
    },
  };
  return res;
}

describe("metadata handler", () => {
  it("returns handler stdout on handled status", async () => {
    const chain = stubChain({ status: "handled", stdout: '{"key":"val"}', stderr: "" });
    const handler = createMetadataHandler(chain);
    const req = mockReq("/latest/meta-data/iam/security-credentials/my-role");
    const res = mockRes();

    await handler(req, res, { pathRemainder: "" });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body, '{"key":"val"}');
    assert.equal(chain.calls[0].requestType, "credentials");
  });

  it("returns 404 when no handler matches", async () => {
    const chain = stubChain({ status: "no-handler", stdout: "", stderr: "" });
    const handler = createMetadataHandler(chain);
    const req = mockReq("/latest/meta-data/instance-id");
    const res = mockRes();

    await handler(req, res, { pathRemainder: "" });

    assert.equal(res.statusCode, 404);
  });

  it("returns 500 on handler error", async () => {
    const chain = stubChain({ status: "error", stdout: "", stderr: "boom" });
    const handler = createMetadataHandler(chain);
    const req = mockReq("/latest/meta-data/instance-id");
    const res = mockRes();

    await handler(req, res, { pathRemainder: "" });

    assert.equal(res.statusCode, 500);
  });

  it("returns 404 for unmapped path", async () => {
    const chain = stubChain({ status: "handled", stdout: "nope", stderr: "" });
    const handler = createMetadataHandler(chain);
    const req = mockReq("/latest/meta-data/something-unknown");
    const res = mockRes();

    await handler(req, res, { pathRemainder: "" });

    assert.equal(res.statusCode, 404);
    assert.equal(chain.calls.length, 0);
  });

  it("passes container info to the chain", async () => {
    const chain = stubChain({ status: "handled", stdout: "ok", stderr: "" });
    const handler = createMetadataHandler(chain);
    const req = mockReq("/latest/meta-data/iam/security-credentials/role", {
      id: "container-1",
      name: "web-app",
      labels: { "imds.role": "arn:aws:iam::123:role/dev" },
    });
    const res = mockRes();

    await handler(req, res, { pathRemainder: "" });

    const request = chain.calls[0].request;
    assert.equal(request.containerId, "container-1");
    assert.equal(request.containerName, "web-app");
    assert.equal(JSON.parse(request.containerLabels)["imds.role"], "arn:aws:iam::123:role/dev");
  });

  it("passes the full request path to the chain", async () => {
    const chain = stubChain({ status: "handled", stdout: "ok", stderr: "" });
    const handler = createMetadataHandler(chain);
    const req = mockReq("/latest/meta-data/iam/security-credentials/my-role");
    const res = mockRes();

    await handler(req, res, { pathRemainder: "" });

    assert.equal(chain.calls[0].request.path, "/latest/meta-data/iam/security-credentials/my-role");
  });
});

function stubLogger() {
  const entries = [];
  const record = (level) => (message, extra) => entries.push({ level, message, ...extra });
  return {
    entries,
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
  };
}

describe("metadata handler status vocabulary", () => {
  it("returns 503 on retry so the client backs off and tries again", async () => {
    const chain = stubChain({ status: "retry", stdout: "", stderr: "throttled" });
    const handler = createMetadataHandler(chain, stubLogger());
    const req = mockReq("/latest/meta-data/iam/security-credentials/my-role");
    const res = mockRes();

    await handler(req, res, { pathRemainder: "" });

    assert.equal(res.statusCode, 503);
  });

  it("returns 404 on needs-attention so the SDK credential chain moves on", async () => {
    const chain = stubChain({
      status: "needs-attention",
      stdout: "",
      stderr: "run: aws sso login",
    });
    const handler = createMetadataHandler(chain, stubLogger());
    const req = mockReq("/latest/meta-data/iam/security-credentials/my-role");
    const res = mockRes();

    await handler(req, res, { pathRemainder: "" });

    assert.equal(res.statusCode, 404);
  });

  it("logs the handler's remediation detail on needs-attention", async () => {
    const logger = stubLogger();
    const chain = stubChain({
      status: "needs-attention",
      stdout: "",
      stderr: "run: aws sso login",
    });
    const handler = createMetadataHandler(chain, logger);
    const req = mockReq("/latest/meta-data/iam/security-credentials/my-role");
    const res = mockRes();

    await handler(req, res, { pathRemainder: "" });

    const warned = logger.entries.find((e) => e.level === "warn");
    assert.ok(warned, "expected a warn entry");
    assert.equal(warned.detail, "run: aws sso login");
    assert.equal(warned.requestType, "credentials");
  });
});
