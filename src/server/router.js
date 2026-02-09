// Path-based routing with longest-prefix-wins semantics and HTTP method enforcement.
//
// Matches incoming requests against a registry of handlers, applying the longest
// matching prefix and validating the HTTP method. Distinguishes between path-not-found
// (404) and path-found-but-method-not-allowed (405) cases for proper client feedback.

export class Router {
  // Initialize router with a static handler registry.
  // Each handler entry: { method, path, handler(req, res, context) }
  constructor(handlers) {
    this.handlers = handlers;
  }

  // Match a request against registered routes, returning handler and metadata.
  // Returns null if no path matches (404 case).
  // Returns { status: 405, allowed: [...] } if path matches but method doesn't.
  // Returns { handler, pathRemainder } on successful match.
  match(method, path) {
    let bestLength = 0;
    let candidatesForPath = [];

    // Find all handlers matching the longest prefix of the request path.
    // Case-sensitive matching ensures predictable behavior for metadata paths.
    for (const handler of this.handlers) {
      if (path.startsWith(handler.path)) {
        if (handler.path.length > bestLength) {
          bestLength = handler.path.length;
          candidatesForPath = [handler];
        } else if (handler.path.length === bestLength) {
          candidatesForPath.push(handler);
        }
      }
    }

    // No prefix matched any path—caller will issue 404
    if (!candidatesForPath.length) {
      return null;
    }

    // Search for matching method among candidates for the longest prefix
    const methodMatch = candidatesForPath.find((h) => h.method === method);

    if (methodMatch) {
      return {
        handler: methodMatch.handler,
        pathRemainder: path.slice(bestLength),
      };
    }

    // Path matched but method didn't—return 405 with allowed methods
    return {
      status: 405,
      allowed: candidatesForPath.map((h) => h.method).sort(),
    };
  }
}
