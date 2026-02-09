import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseCli, loadConfig } from "./config/loader.js";
import { createLogger } from "./util/logger.js";
import { createImdsServer } from "./server/create-server.js";
import { withMiddleware } from "./server/middleware.js";

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
  --config <path>                Path to YAML config file
  --handler-command <cmd>        External command invoked per-request to generate responses
  --handler-command-timeout <ms> Timeout for handler command in ms (default: 5000)
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

  // Placeholder handler until routing is implemented
  function placeholderHandler(req, res) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK\n");
  }

  const handler = withMiddleware(placeholderHandler, logger);
  const { start, close } = createImdsServer(config, handler, logger);

  await start();

  // Basic shutdown: stop accepting connections on SIGINT/SIGTERM
  function shutdown(signal) {
    logger.info("Shutting down", { signal });
    close().then(() => {
      process.exitCode = 0;
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
