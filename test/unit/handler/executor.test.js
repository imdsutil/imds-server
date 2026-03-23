import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { executeHandler } from "../../../src/handler/executor.js";

// Create a temp directory for test scripts
const tmpDir = mkdtempSync(join(tmpdir(), "handler-test-"));

function writeScript(name, content) {
  const path = join(tmpDir, name);
  writeFileSync(path, `#!/usr/bin/env bash\n${content}\n`);
  chmodSync(path, 0o755);
  return path;
}

// Test scripts
const echoScript = writeScript("echo-handler.sh", 'echo "hello from handler"');
const exitOneScript = writeScript("skip-handler.sh", "exit 1");
const exitTwoScript = writeScript("error-handler.sh", "exit 2");
const stderrScript = writeScript(
  "stderr-handler.sh",
  'echo "debug info" >&2\necho "response body"',
);
const argsScript = writeScript("args-handler.sh", 'echo "$@"');
const slowScript = writeScript("slow-handler.sh", "sleep 10\necho done");
const jsonScript = writeScript(
  "json-handler.sh",
  'echo \'{"AccessKeyId":"AKIA","SecretAccessKey":"secret"}\'',
);
const multilineScript = writeScript(
  "multiline-handler.sh",
  'echo "line1"\necho "line2"\necho "line3"',
);

const baseRequest = {
  path: "/latest/meta-data/iam/security-credentials/my-role",
  containerId: "abc123",
  containerName: "my-app",
  containerLabels: JSON.stringify({ "imds.role": "arn:aws:iam::123456:role/dev" }),
};

// Cleanup temp dir after all tests
test.after(() => {
  rmSync(tmpDir, { recursive: true });
});

test("executeHandler: returns stdout on exit code 0", async () => {
  const result = await executeHandler(echoScript, baseRequest, { timeout: 5000 });

  assert.strictEqual(result.status, "handled");
  assert.strictEqual(result.stdout, "hello from handler\n");
});

test("executeHandler: returns pass on exit code 1", async () => {
  const result = await executeHandler(exitOneScript, baseRequest, { timeout: 5000 });

  assert.strictEqual(result.status, "pass");
  assert.strictEqual(result.stdout, "");
});

test("executeHandler: returns error on exit code 2", async () => {
  const result = await executeHandler(exitTwoScript, baseRequest, { timeout: 5000 });

  assert.strictEqual(result.status, "error");
});

test("executeHandler: captures stderr separately from stdout", async () => {
  const result = await executeHandler(stderrScript, baseRequest, { timeout: 5000 });

  assert.strictEqual(result.status, "handled");
  assert.strictEqual(result.stdout, "response body\n");
  assert.strictEqual(result.stderr, "debug info\n");
});

test("executeHandler: passes request context as CLI args", async () => {
  const result = await executeHandler(argsScript, baseRequest, { timeout: 5000 });

  assert.strictEqual(result.status, "handled");
  const args = result.stdout.trim();
  assert.ok(args.includes(baseRequest.path), "should include path");
  assert.ok(args.includes(baseRequest.containerId), "should include container id");
  assert.ok(args.includes(baseRequest.containerName), "should include container name");
  assert.ok(args.includes("imds.role"), "should include container labels");
});

test("executeHandler: kills process on timeout", async () => {
  const result = await executeHandler(slowScript, baseRequest, { timeout: 200 });

  assert.strictEqual(result.status, "error");
  assert.ok(result.timedOut, "should indicate timeout");
});

test("executeHandler: handles JSON output", async () => {
  const result = await executeHandler(jsonScript, baseRequest, { timeout: 5000 });

  assert.strictEqual(result.status, "handled");
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.AccessKeyId, "AKIA");
});

test("executeHandler: captures multiline stdout", async () => {
  const result = await executeHandler(multilineScript, baseRequest, { timeout: 5000 });

  assert.strictEqual(result.status, "handled");
  assert.strictEqual(result.stdout, "line1\nline2\nline3\n");
});

test("executeHandler: returns error for non-existent command", async () => {
  const result = await executeHandler("/nonexistent/command", baseRequest, { timeout: 5000 });

  assert.strictEqual(result.status, "error");
});

test("executeHandler: treats unexpected exit codes as error", async () => {
  const script = writeScript("exit-42.sh", "exit 42");
  const result = await executeHandler(script, baseRequest, { timeout: 5000 });

  assert.strictEqual(result.status, "error");
});
