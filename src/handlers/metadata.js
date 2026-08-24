// Metadata request handler: maps incoming IMDS paths to request types
// and delegates to the handler chain for response generation.

import { mapPathToRequestType } from "../handler/path-mapper.js";

export function createMetadataHandler(chain, logger) {
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

    if (result.status === "handled") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(result.stdout);
    } else if (result.status === "error") {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error\n");
    } else if (result.status === "retry") {
      // Transient. 503 is the one status AWS SDKs already back off and retry on,
      // so the handler's "try me again" reaches the client through the protocol
      // rather than through a convention the client would have to know about.
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("Service Unavailable\n");
    } else if (result.status === "needs-attention") {
      // A person has to act, and no amount of waiting on this request will
      // summon them. Answering 404 makes this look like an instance with no
      // role attached, which the SDK credential chain handles cleanly instead
      // of hanging; the operator learns what to do from the log, not the wire.
      logger.warn("handler needs attention", {
        requestType,
        detail: result.stderr.trim(),
      });
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found\n");
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found\n");
    }
  };
}
