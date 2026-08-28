import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHandlerOutput } from "../../../src/handler/envelope.js";

describe("envelope detection", () => {
  it("treats a plain string as a bare body", () => {
    const result = parseHandlerOutput("i-1234567890abcdef0\n", "handled");

    assert.equal(result.kind, "body");
    assert.equal(result.body, "i-1234567890abcdef0\n");
  });

  it("treats JSON without the marker as a bare body", () => {
    const raw = '{"Code":"Success","AccessKeyId":"ASIA"}';
    const result = parseHandlerOutput(raw, "handled");

    assert.equal(result.kind, "body");
    assert.equal(result.body, raw);
  });

  it("does not mistake the instance identity document for an envelope", () => {
    const raw = '{"accountId":"111122223333","version":"2017-09-30"}';
    const result = parseHandlerOutput(raw, "handled");

    assert.equal(result.kind, "body");
  });

  it("detects an envelope by its marker", () => {
    const raw = '{"imdsEnvelopeVersion":1,"body":"i-123"}';
    const result = parseHandlerOutput(raw, "handled");

    assert.equal(result.kind, "envelope");
    assert.equal(result.envelope.body, "i-123");
  });

  it("strips leading whitespace before testing", () => {
    const raw = '\n  {\n  "imdsEnvelopeVersion": 1,\n  "body": "i-123"\n}';
    const result = parseHandlerOutput(raw, "handled");

    assert.equal(result.kind, "envelope");
    assert.equal(result.envelope.body, "i-123");
  });

  it("treats a non-integer marker as a bare body", () => {
    const raw = '{"imdsEnvelopeVersion":"1","body":"x"}';
    const result = parseHandlerOutput(raw, "handled");

    assert.equal(result.kind, "body");
  });

  it("treats unparseable JSON as a bare body", () => {
    const raw = '{"Code":"Success",';
    const result = parseHandlerOutput(raw, "handled");

    assert.equal(result.kind, "body");
    assert.equal(result.body, raw);
  });

  it("treats a JSON array as a bare body", () => {
    const result = parseHandlerOutput('["a","b"]', "handled");

    assert.equal(result.kind, "body");
  });
});

describe("envelope validation: the marker binds", () => {
  it("rejects an unsupported version rather than proxying it", () => {
    const result = parseHandlerOutput('{"imdsEnvelopeVersion":99,"body":"x"}', "handled");

    assert.equal(result.kind, "invalid");
    assert.match(result.reason, /version/i);
  });

  it("rejects a handled envelope with no body", () => {
    const result = parseHandlerOutput('{"imdsEnvelopeVersion":1}', "handled");

    assert.equal(result.kind, "invalid");
    assert.match(result.reason, /body/i);
  });

  it("allows a failure envelope with no body", () => {
    const result = parseHandlerOutput('{"imdsEnvelopeVersion":1,"retryAfter":30}', "retry");

    assert.equal(result.kind, "envelope");
    assert.equal(result.envelope.retryAfter, 30);
  });

  it("carries remediation and authScope on needs-attention", () => {
    const raw = JSON.stringify({
      imdsEnvelopeVersion: 1,
      remediation: "aws sso login",
      authScope: "sso:acme.awsapps.com/start",
    });
    const result = parseHandlerOutput(raw, "needs-attention");

    assert.equal(result.kind, "envelope");
    assert.equal(result.envelope.remediation, "aws sso login");
    assert.equal(result.envelope.authScope, "sso:acme.awsapps.com/start");
  });

  it("ignores unknown fields so later versions can add them", () => {
    const raw = '{"imdsEnvelopeVersion":1,"body":"x","somethingNew":true}';
    const result = parseHandlerOutput(raw, "handled");

    assert.equal(result.kind, "envelope");
    assert.equal(result.envelope.body, "x");
  });

  it("carries expiresAt and cacheKey through for the cache to use", () => {
    const raw = JSON.stringify({
      imdsEnvelopeVersion: 1,
      body: "x",
      expiresAt: "2026-08-27T18:00:00Z",
      cacheKey: "aws:role/dev",
    });
    const result = parseHandlerOutput(raw, "handled");

    assert.equal(result.envelope.expiresAt, "2026-08-27T18:00:00Z");
    assert.equal(result.envelope.cacheKey, "aws:role/dev");
  });
});
