// Request middleware: wraps a handler with request logging and an error boundary.
//
// Provides cross-cutting concerns for all IMDS requests: observability through metrics
// and structured request logging, plus graceful error handling to ensure the server
// doesn't crash from unhandled exceptions in request handlers.

const TOKEN_HEADER = "x-aws-ec2-metadata-token";
const TOKEN_ENDPOINT = "/latest/api/token";

// Determines if token authentication should be enforced for a request.
// Returns null if validation passes, or an HTTP status code if rejected.
export function validateTokenRequirement(req, config, tokenStore) {
  // Token endpoint itself doesn't require a token
  if (req.url === TOKEN_ENDPOINT && req.method === "PUT") {
    return null;
  }

  const token = req.headers[TOKEN_HEADER];
  const { imdsVersion } = config;

  // IMDSv2-only mode: all requests must have valid tokens
  if (imdsVersion === "2") {
    if (!token) {
      return 401; // Unauthorized - token required but missing
    }
    if (!tokenStore.validateToken(token)) {
      return 401; // Unauthorized - invalid or expired token
    }
    return null;
  }

  // IMDSv1-only mode: tokens not accepted, requests always allowed
  if (imdsVersion === "1") {
    return null;
  }

  // Auto mode: once any token has been created, require tokens on all subsequent requests
  if (imdsVersion === "auto") {
    if (tokenStore.hasEverCreatedToken()) {
      // Server has switched to v2 mode - tokens now required
      if (!token) {
        return 401;
      }
      if (!tokenStore.validateToken(token)) {
        return 401;
      }
    }
    // If no tokens have been created yet, allow tokenless v1 requests
    return null;
  }

  return null;
}

export function withMiddleware(handler, logger) {
  return (req, res) => {
    // Capture request start time for latency telemetry
    const start = Date.now();

    // Log request completion with metrics once the response is fully written.
    // This hook fires after writeHead and all data has been flushed to the client.
    res.on("finish", () => {
      const duration = Date.now() - start;
      logger.info("request", {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        durationMs: duration,
      });
    });

    try {
      // Execute the handler and catch both synchronous and asynchronous errors.
      // Handlers may be promises or sync functions, so we defend against both.
      const result = handler(req, res);
      if (result && typeof result.catch === "function") {
        result.catch((err) => handleError(err, res, logger));
      }
    } catch (err) {
      // Catch synchronous errors from the handler
      handleError(err, res, logger);
    }
  };
}

// Gracefully handles errors by logging them and sending a 500 response to the client
// if headers haven't already been sent. Prevents duplicate response writes that would crash the server.
function handleError(err, res, logger) {
  logger.error("Unhandled error", { message: err.message, stack: err.stack });
  if (!res.headersSent) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error\n");
  }
}
