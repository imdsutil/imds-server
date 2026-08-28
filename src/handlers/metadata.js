// Metadata request handler: maps incoming IMDS paths to request types
// and delegates to the handler chain for response generation.

import { mapPathToRequestType } from "../handler/path-mapper.js";
import { parseHandlerOutput } from "../handler/envelope.js";

// Request types where an envelope buys the server something. Without one, a
// credentials response cannot be cached or rendered for more than one endpoint,
// which is worth telling the operator about once.
const ENVELOPE_RECOMMENDED = new Set(["credentials"]);

function renderBody(body) {
  return typeof body === "string" ? body : JSON.stringify(body);
}

export function createMetadataHandler(chain, logger) {
  // The same handler answers every request of a type for the life of the
  // process, so the recommendation is logged once rather than on every call.
  const recommended = new Set();

  return async (req, res) => {
    const requestType = mapPathToRequestType(req.url);

    if (!requestType) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found\n");
      return;
    }

    const request = {
      path: req.url,
      containerId: req.containerInfo.id,
      containerName: req.containerInfo.name,
      containerLabels: JSON.stringify(req.containerInfo.labels),
    };

    const result = await chain.execute(requestType, request);
    const parsed = parseHandlerOutput(result.stdout, result.status);

    if (parsed.kind === "invalid") {
      // The handler claimed to speak the protocol and got it wrong. Relaying the
      // raw bytes would hand the client control data dressed as a response.
      logger.error("handler returned an invalid envelope", {
        requestType,
        command: result.command,
        reason: parsed.reason,
      });
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error\n");
      return;
    }

    const envelope = parsed.kind === "envelope" ? parsed.envelope : null;

    if (result.status === "handled") {
      if (!envelope && ENVELOPE_RECOMMENDED.has(requestType)) {
        const key = `${result.command}\u0000${requestType}`;
        if (!recommended.has(key)) {
          recommended.add(key);
          logger.warn("handler response is not an envelope", {
            requestType,
            command: result.command,
            detail: "responses for this type cannot be cached or re-rendered without one",
          });
        }
      }
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(envelope ? renderBody(envelope.body) : result.stdout);
    } else if (result.status === "error") {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error\n");
    } else if (result.status === "retry") {
      // Transient. 503 is the one status AWS SDKs already back off and retry on,
      // so the handler's "try me again" reaches the client through the protocol
      // rather than through a convention the client would have to know about.
      const headers = { "Content-Type": "text/plain" };
      if (Number.isFinite(envelope?.retryAfter)) {
        headers["Retry-After"] = String(envelope.retryAfter);
      }
      res.writeHead(503, headers);
      res.end("Service Unavailable\n");
    } else if (result.status === "needs-attention") {
      // A person has to act, and no amount of waiting on this request will
      // summon them. Answering 404 makes this look like an instance with no
      // role attached, which the SDK credential chain handles cleanly instead
      // of hanging; the operator learns what to do from the log, not the wire.
      // An envelope states the remediation; stderr is what a handler that
      // hasn't adopted one has to offer, so fall back to it.
      logger.warn("handler needs attention", {
        requestType,
        command: result.command,
        detail: envelope?.remediation ?? result.stderr.trim(),
        ...(envelope?.authScope ? { authScope: envelope.authScope } : {}),
      });
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found\n");
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found\n");
    }
  };
}
