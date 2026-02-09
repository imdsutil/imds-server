// Creates and manages an HTTP server bound to TCP or a Unix domain socket.
// Handles stale socket cleanup for UDS and provides a clean start/close lifecycle.

import { createServer } from "node:http";
import { unlinkSync } from "node:fs";

export function createImdsServer(config, handler, logger) {
  const server = createServer(handler);

  // Initializes the server and binds it to the configured endpoint (TCP or Unix socket).
  // Handles cleanup of stale socket files.
  function start() {
    return new Promise((resolve, reject) => {
      server.once("error", reject);

      function onListening() {
        server.removeListener("error", reject);
        const addr = server.address();
        if (typeof addr === "string") {
          logger.info("Server listening", { socket: addr });
        } else {
          logger.info("Server listening", { host: addr.address, port: addr.port });
        }
        resolve(server);
      }

      if (config.socket) {
        // Ensure clean startup by removing stale socket files from previous runs.
        // Without this, the listen call will fail if the socket already exists.
        try {
          unlinkSync(config.socket);
        } catch (err) {
          // ENOENT (file not found) is expected on first startup
          if (err.code !== "ENOENT") throw err;
        }
        server.listen(config.socket, onListening);
      } else {
        // Listen on TCP when socket path is not configured
        server.listen(config.port, config.host, onListening);
      }
    });
  }

  // Gracefully shuts down the server and its connections.
  function close() {
    return new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  // Return result with the underlying server and lifecycle methods for caller control
  return { server, start, close };
}
