// Request middleware: wraps a handler with request logging and an error boundary.
//
// Provides cross-cutting concerns for all IMDS requests: observability through metrics
// and structured request logging, plus graceful error handling to ensure the server
// doesn't crash from unhandled exceptions in request handlers.

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
