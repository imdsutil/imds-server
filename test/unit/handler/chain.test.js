import { test } from "node:test";
import assert from "node:assert/strict";
import { HandlerChain } from "../../../src/handler/chain.js";

// Stub executor that returns predefined results per command
function stubExecutor(results) {
  const calls = [];
  const executor = async (command, request, options) => {
    calls.push({ command, request, options });
    return results[command];
  };
  return { executor, calls };
}

const baseRequest = {
  path: "/latest/meta-data/iam/security-credentials/my-role",
  containerId: "abc123",
  containerName: "my-app",
  containerLabels: "{}",
};

test("HandlerChain: returns no-handler when no handlers registered", async () => {
  const { executor } = stubExecutor({});
  const chain = new HandlerChain({ timeout: 5000, executor });

  const result = await chain.execute("credentials", baseRequest);
  assert.equal(result.status, "no-handler");
});

test("HandlerChain: returns no-handler for unregistered request type", async () => {
  const { executor } = stubExecutor({
    "/usr/bin/handler-a": { status: "handled", stdout: "ok", stderr: "", timedOut: false },
  });
  const chain = new HandlerChain({ timeout: 5000, executor });
  chain.register("credentials", "/usr/bin/handler-a");

  const result = await chain.execute("region", baseRequest);
  assert.equal(result.status, "no-handler");
});

test("HandlerChain: single handler that handles returns its result", async () => {
  const { executor } = stubExecutor({
    "/usr/bin/creds": { status: "handled", stdout: '{"key":"val"}', stderr: "", timedOut: false },
  });
  const chain = new HandlerChain({ timeout: 5000, executor });
  chain.register("credentials", "/usr/bin/creds");

  const result = await chain.execute("credentials", baseRequest);
  assert.equal(result.status, "handled");
  assert.equal(result.stdout, '{"key":"val"}');
});

test("HandlerChain: first handler passes, second handles", async () => {
  const { executor, calls } = stubExecutor({
    "/usr/bin/skip": { status: "pass", stdout: "", stderr: "", timedOut: false },
    "/usr/bin/handle": { status: "handled", stdout: "response", stderr: "", timedOut: false },
  });
  const chain = new HandlerChain({ timeout: 5000, executor });
  chain.register("credentials", "/usr/bin/skip");
  chain.register("credentials", "/usr/bin/handle");

  const result = await chain.execute("credentials", baseRequest);
  assert.equal(result.status, "handled");
  assert.equal(result.stdout, "response");
  assert.equal(calls.length, 2);
});

test("HandlerChain: first handler handles, second is not called", async () => {
  const { executor, calls } = stubExecutor({
    "/usr/bin/first": { status: "handled", stdout: "first", stderr: "", timedOut: false },
    "/usr/bin/second": { status: "handled", stdout: "second", stderr: "", timedOut: false },
  });
  const chain = new HandlerChain({ timeout: 5000, executor });
  chain.register("credentials", "/usr/bin/first");
  chain.register("credentials", "/usr/bin/second");

  const result = await chain.execute("credentials", baseRequest);
  assert.equal(result.status, "handled");
  assert.equal(result.stdout, "first");
  assert.equal(calls.length, 1);
});

test("HandlerChain: error stops the chain", async () => {
  const { executor, calls } = stubExecutor({
    "/usr/bin/broken": { status: "error", stdout: "", stderr: "boom", timedOut: false },
    "/usr/bin/good": { status: "handled", stdout: "ok", stderr: "", timedOut: false },
  });
  const chain = new HandlerChain({ timeout: 5000, executor });
  chain.register("credentials", "/usr/bin/broken");
  chain.register("credentials", "/usr/bin/good");

  const result = await chain.execute("credentials", baseRequest);
  assert.equal(result.status, "error");
  assert.equal(result.stderr, "boom");
  assert.equal(calls.length, 1);
});

test("HandlerChain: all handlers pass returns no-handler", async () => {
  const { executor } = stubExecutor({
    "/usr/bin/a": { status: "pass", stdout: "", stderr: "", timedOut: false },
    "/usr/bin/b": { status: "pass", stdout: "", stderr: "", timedOut: false },
  });
  const chain = new HandlerChain({ timeout: 5000, executor });
  chain.register("credentials", "/usr/bin/a");
  chain.register("credentials", "/usr/bin/b");

  const result = await chain.execute("credentials", baseRequest);
  assert.equal(result.status, "no-handler");
});

test("HandlerChain: passes timeout to executor", async () => {
  const { executor, calls } = stubExecutor({
    "/usr/bin/cmd": { status: "handled", stdout: "", stderr: "", timedOut: false },
  });
  const chain = new HandlerChain({ timeout: 3000, executor });
  chain.register("credentials", "/usr/bin/cmd");

  await chain.execute("credentials", baseRequest);
  assert.equal(calls[0].options.timeout, 3000);
});

test("HandlerChain: passes request to executor", async () => {
  const { executor, calls } = stubExecutor({
    "/usr/bin/cmd": { status: "handled", stdout: "", stderr: "", timedOut: false },
  });
  const chain = new HandlerChain({ timeout: 5000, executor });
  chain.register("credentials", "/usr/bin/cmd");

  await chain.execute("credentials", baseRequest);
  assert.deepEqual(calls[0].request, baseRequest);
});

test("HandlerChain: multiple request types are independent", async () => {
  const { executor } = stubExecutor({
    "/usr/bin/creds": { status: "handled", stdout: "creds", stderr: "", timedOut: false },
    "/usr/bin/region": { status: "handled", stdout: "us-east-1", stderr: "", timedOut: false },
  });
  const chain = new HandlerChain({ timeout: 5000, executor });
  chain.register("credentials", "/usr/bin/creds");
  chain.register("region", "/usr/bin/region");

  const credsResult = await chain.execute("credentials", baseRequest);
  assert.equal(credsResult.stdout, "creds");

  const regionResult = await chain.execute("region", baseRequest);
  assert.equal(regionResult.stdout, "us-east-1");
});

test("HandlerChain: per-handler timeout overrides global default", async () => {
  const { executor, calls } = stubExecutor({
    "/usr/bin/cmd": { status: "handled", stdout: "", stderr: "", timedOut: false },
  });
  const chain = new HandlerChain({ timeout: 5000, executor });
  chain.register("credentials", "/usr/bin/cmd", { timeout: 15000 });

  await chain.execute("credentials", baseRequest);
  assert.equal(calls[0].options.timeout, 15000);
});

test("HandlerChain: falls back to global timeout when no override", async () => {
  const { executor, calls } = stubExecutor({
    "/usr/bin/cmd": { status: "handled", stdout: "", stderr: "", timedOut: false },
  });
  const chain = new HandlerChain({ timeout: 5000, executor });
  chain.register("credentials", "/usr/bin/cmd");

  await chain.execute("credentials", baseRequest);
  assert.equal(calls[0].options.timeout, 5000);
});

test("HandlerChain: registration order is preserved", async () => {
  const order = [];
  const executor = async (command) => {
    order.push(command);
    return { status: "pass", stdout: "", stderr: "", timedOut: false };
  };
  const chain = new HandlerChain({ timeout: 5000, executor });
  chain.register("credentials", "/usr/bin/first");
  chain.register("credentials", "/usr/bin/second");
  chain.register("credentials", "/usr/bin/third");

  await chain.execute("credentials", baseRequest);
  assert.deepEqual(order, ["/usr/bin/first", "/usr/bin/second", "/usr/bin/third"]);
});
