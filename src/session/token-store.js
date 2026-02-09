// In-memory token store for IMDSv2 session authentication.
//
// Manages token lifecycle: creation with TTL, validation, and automatic expiry cleanup.
// Tracks whether any token has ever been issued to support "auto" IMDS version mode,
// where the server switches from v1 to v2 behavior after the first token request.

import { randomUUID } from "node:crypto";

export class TokenStore {
  // Initialize store with periodic cleanup to prevent memory leaks from expired tokens.
  constructor(cleanupIntervalMs = 60000) {
    this.tokens = new Map(); // token -> { expiresAt: timestamp }
    this.hasCreatedToken = false; // Tracks if any token ever issued (for auto mode)
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);

    // Allow process to exit cleanly if this is the only active timer
    this.cleanupInterval.unref();
  }

  // Generate a new session token valid for the specified TTL in seconds.
  // Returns the token string to be sent to the client.
  createToken(ttlSeconds) {
    const token = randomUUID();
    const expiresAt = Date.now() + ttlSeconds * 1000;

    this.tokens.set(token, { expiresAt });
    this.hasCreatedToken = true;

    return token;
  }

  // Check if a token exists and has not expired.
  // Returns true if valid, false if missing or expired.
  validateToken(token) {
    const entry = this.tokens.get(token);
    if (!entry) return false;

    if (Date.now() >= entry.expiresAt) {
      this.tokens.delete(token);
      return false;
    }

    return true;
  }

  // Returns whether any token has been created since server start.
  // Used by "auto" mode to determine if v2 should be enforced.
  hasEverCreatedToken() {
    return this.hasCreatedToken;
  }

  // Remove expired tokens to prevent unbounded memory growth.
  // Called periodically by cleanup interval.
  cleanup() {
    const now = Date.now();
    for (const [token, entry] of this.tokens) {
      if (now >= entry.expiresAt) {
        this.tokens.delete(token);
      }
    }
  }

  // Stop the cleanup interval. Should be called on server shutdown.
  close() {
    clearInterval(this.cleanupInterval);
  }
}
