import { test } from "node:test";
import assert from "node:assert";
import { TokenStore } from "../../../src/session/token-store.js";

test("TokenStore: creates valid tokens", () => {
  const store = new TokenStore();
  const token = store.createToken(300);

  assert.ok(token, "Token should be a non-empty string");
  assert.strictEqual(typeof token, "string");
  assert.ok(token.length > 0);

  store.close();
});

test("TokenStore: validates newly created tokens", () => {
  const store = new TokenStore();
  const token = store.createToken(300);

  assert.strictEqual(store.validateToken(token), true);

  store.close();
});

test("TokenStore: rejects non-existent tokens", () => {
  const store = new TokenStore();

  assert.strictEqual(store.validateToken("nonexistent-token"), false);

  store.close();
});

test("TokenStore: tracks if tokens have been created", () => {
  const store = new TokenStore();

  assert.strictEqual(store.hasEverCreatedToken(), false, "Should be false initially");

  store.createToken(300);

  assert.strictEqual(store.hasEverCreatedToken(), true, "Should be true after creating a token");

  store.close();
});

test("TokenStore: hasEverCreatedToken persists even after token expiry", () => {
  const store = new TokenStore();

  assert.strictEqual(store.hasEverCreatedToken(), false);

  store.createToken(1); // 1 second TTL

  assert.strictEqual(store.hasEverCreatedToken(), true);

  // Even after cleanup, the flag remains true
  store.cleanup();

  assert.strictEqual(store.hasEverCreatedToken(), true);

  store.close();
});

test("TokenStore: expired tokens are rejected", async () => {
  const store = new TokenStore();
  const token = store.createToken(1); // 1 second TTL

  // Token should be valid immediately
  assert.strictEqual(store.validateToken(token), true);

  // Wait for token to expire
  await new Promise((resolve) => setTimeout(resolve, 1100));

  // Token should now be invalid
  assert.strictEqual(store.validateToken(token), false);

  store.close();
});

test("TokenStore: cleanup removes expired tokens", async () => {
  const store = new TokenStore();
  const token = store.createToken(1); // 1 second TTL

  assert.strictEqual(store.validateToken(token), true);

  // Wait for expiration
  await new Promise((resolve) => setTimeout(resolve, 1100));

  // Manually trigger cleanup
  store.cleanup();

  // Token should be gone from the store
  assert.strictEqual(store.validateToken(token), false);

  store.close();
});

test("TokenStore: cleanup preserves valid tokens", async () => {
  const store = new TokenStore();
  const shortToken = store.createToken(1);
  const longToken = store.createToken(3600);

  // Both valid initially
  assert.strictEqual(store.validateToken(shortToken), true);
  assert.strictEqual(store.validateToken(longToken), true);

  // Wait for short token to expire
  await new Promise((resolve) => setTimeout(resolve, 1100));

  store.cleanup();

  // Short token removed, long token preserved
  assert.strictEqual(store.validateToken(shortToken), false);
  assert.strictEqual(store.validateToken(longToken), true);

  store.close();
});

test("TokenStore: multiple tokens can coexist", () => {
  const store = new TokenStore();

  const token1 = store.createToken(300);
  const token2 = store.createToken(600);
  const token3 = store.createToken(900);

  assert.strictEqual(store.validateToken(token1), true);
  assert.strictEqual(store.validateToken(token2), true);
  assert.strictEqual(store.validateToken(token3), true);

  // Tokens are independent
  assert.notStrictEqual(token1, token2);
  assert.notStrictEqual(token2, token3);
  assert.notStrictEqual(token1, token3);

  store.close();
});

test("TokenStore: close stops cleanup interval", async () => {
  const store = new TokenStore(100); // Short cleanup interval for testing

  store.close();

  // Should not throw after close
  assert.doesNotThrow(() => store.cleanup());
});

test("TokenStore: supports custom cleanup interval", (t, done) => {
  const store = new TokenStore(50); // 50ms cleanup interval

  // Create an expired token
  store.tokens.set("expired", { expiresAt: Date.now() - 1000 });

  // Wait for cleanup to run
  setTimeout(() => {
    // Token should have been cleaned up automatically
    assert.strictEqual(store.validateToken("expired"), false);
    store.close();
    done();
  }, 100);
});
