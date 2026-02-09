// JSON-lines structured logger. Each log entry is a single JSON line to stdout.
// Respects the configured logLevel threshold.
//
// Provides configurable severity-based filtering and structured context for observability.
// Uses JSON-lines format for compatibility with log aggregators and programmatic parsing.

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

// Creates a logger instance with a configurable severity threshold.
// Log calls below the threshold are silently dropped
export function createLogger(logLevel = "info") {
  const threshold = LEVELS[logLevel] ?? LEVELS.info;

  // Core logging function that enforces the severity threshold and formats output.
  function log(level, message, extra) {
    if (LEVELS[level] < threshold) return;
    const entry = { timestamp: new Date().toISOString(), level, message, ...extra };
    process.stdout.write(JSON.stringify(entry) + "\n");
  }

  // Convenience methods for each log level. Extra metadata is optional and enables
  // adding request IDs, error details, or other context to each log entry.
  return {
    debug: (message, extra) => log("debug", message, extra),
    info: (message, extra) => log("info", message, extra),
    warn: (message, extra) => log("warn", message, extra),
    error: (message, extra) => log("error", message, extra),
  };
}

// Export severity levels for external threshold configuration or testing
export { LEVELS };
