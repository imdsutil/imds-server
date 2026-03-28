import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseCli, loadConfig } from "./config/loader.js";
import { createLogger } from "./util/logger.js";
import { createImdsServer } from "./server/create-server.js";
import { withMiddleware, validateTokenRequirement } from "./server/middleware.js";
import { Router } from "./server/router.js";
import { HANDLERS, notFoundHandler } from "./handlers/index.js";
import { createMetadataHandler } from "./handlers/metadata.js";
import { HandlerChain } from "./handler/chain.js";
import { executeHandler } from "./handler/executor.js";
import { TokenStore } from "./session/token-store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion() {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
  return pkg.version;
}

function printHelp() {
  const help = `
imds-server v${getVersion()}

A local IMDS (Instance Metadata Service) server for development and testing.

Usage: imds-server [options]

Options:
  --host <addr>                  TCP bind address (default: 127.0.0.1)
  --port <port>                  TCP bind port (default: 80)
  --socket <path>                Unix domain socket path (mutually exclusive with --host/--port)
  --token-ttl <seconds>          Default IMDSv2 token TTL (default: 21600)
  --imds-version <version>       IMDS version: 1, 2, or auto (default: auto)
  --config <path>                Path to YAML config file (default: ~/.imds-server.yaml)
  --handler-timeout <ms>         Default timeout for handler commands in ms (default: 5000)
  --log-level <level>            Log level: debug, info, warn, error (default: info)
  -h, --help                     Show this help message
  -v, --version                  Show version number
`.trim();

  console.log(help);
}

const cliValues = parseCli();

if (cliValues.help) {
  printHelp();
  process.exitCode = 0;
} else if (cliValues.version) {
  console.log(getVersion());
  process.exitCode = 0;
} else {
  const config = loadConfig(cliValues);
  const logger = createLogger(config.logLevel);

  // Create token store for IMDSv2 session authentication
  const tokenStore = new TokenStore();

  // Build handler chain from configured handlers
  const chain = new HandlerChain({ timeout: config.handlerTimeout, executor: executeHandler });
  for (const h of config.handlers) {
    for (const type of h.types) {
      chain.register(type, h.command, { timeout: h.timeout });
    }
  }

  // Register metadata handler for IMDS paths
  const metadataHandler = createMetadataHandler(chain);
  const allHandlers = [
    ...HANDLERS,
    { method: "GET", path: "/latest/meta-data", handler: metadataHandler },
    { method: "GET", path: "/latest/dynamic", handler: metadataHandler },
  ];

  // Create router and routing handler that dispatches requests to registered handlers.
  // Handles 404 (path not found), 405 (method not allowed), and successful routing.
  const router = new Router(allHandlers);

  const routingHandler = async (req, res) => {
    // Token validation only applies to IMDS paths — non-IMDS paths (e.g. /status) are exempt
    if (req.url.startsWith("/latest")) {
      const tokenError = validateTokenRequirement(req, config, tokenStore);
      if (tokenError) {
        res.writeHead(tokenError, { "Content-Type": "text/plain" });
        res.end(tokenError === 401 ? "Unauthorized\n" : "Forbidden\n");
        return;
      }
    }

    const match = router.match(req.method, req.url);

    if (!match) {
      // No path matches—issue 404
      await notFoundHandler(req, res, { logger, config });
      return;
    }

    if (match.status === 405) {
      // Path matched but method didn't—issue 405 with Allow header
      res.writeHead(405, {
        Allow: match.allowed.join(", "),
        "Content-Type": "text/plain",
      });
      res.end("Method Not Allowed\n");
      return;
    }

    // Path and method matched—invoke handler with context
    await match.handler(req, res, {
      logger,
      config,
      tokenStore,
      pathRemainder: match.pathRemainder,
    });
  };

  const containerInfoHandler = async (req) => {
    // Add container info to req
    const containerInfo = {
      id: req.headers["x-container-id"] || "unknown",
      name: req.headers["x-container-name"] || "unknown",
      labels: req.headers["x-container-labels"]
        ? JSON.parse(req.headers["x-container-labels"])
        : {},
    };
    logger.debug("Container info", { containerInfo });
    req.containerInfo = containerInfo;
  };

  const handler = withMiddleware(async function (req, res) {
    await containerInfoHandler(req, res);
    await routingHandler(req, res);
  }, logger);
  const { start, close } = createImdsServer(config, handler, logger);

  await start();

  // Basic shutdown: stop accepting connections and cleanup resources on SIGINT/SIGTERM
  function shutdown(signal) {
    logger.info("Shutting down", { signal });
    tokenStore.close();
    close().then(() => {
      process.exitCode = 0;
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
