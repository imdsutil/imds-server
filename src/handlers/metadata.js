// Metadata request handler: maps incoming IMDS paths to request types
// and delegates to the handler chain for response generation.

import { mapPathToRequestType } from "../handler/path-mapper.js";

export function createMetadataHandler(chain) {
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
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found\n");
    }
  };
}
