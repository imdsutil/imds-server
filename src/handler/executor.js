// Handler command executor: runs an external command as a subprocess and
// interprets exit codes to determine if the handler provided a response.
//
// Exit code contract:
//   0 - handled: stdout is the response body
//   1 - pass: handler declined, try the next one in the chain
//   2 - error: something went wrong, stop the chain
//   Any other code is treated as an error.

import { spawn } from "node:child_process";

/**
 * Execute a handler command with request context passed as CLI args.
 *
 * @param {string} command - Path to the handler executable
 * @param {object} request - Request context
 * @param {string} request.path - The IMDS request path
 * @param {string} request.containerId - Container ID from proxy headers
 * @param {string} request.containerName - Container name from proxy headers
 * @param {string} request.containerLabels - JSON-encoded container labels
 * @param {object} options
 * @param {number} options.timeout - Max execution time in ms
 * @returns {Promise<{status: string, stdout: string, stderr: string, timedOut?: boolean}>}
 */
export function executeHandler(command, request, options) {
  const { timeout } = options;

  const args = [
    "--path",
    request.path,
    "--container-id",
    request.containerId,
    "--container-name",
    request.containerName,
    "--container-labels",
    request.containerLabels,
  ];

  return new Promise((resolve) => {
    let child;
    let timedOut = false;
    let timer;

    try {
      child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
    } catch {
      resolve({ status: "error", stdout: "", stderr: "", timedOut: false });
      return;
    }

    let stdout = "";
    let stderr = "";

    // Kill the entire process group on timeout so child processes
    // (like sleep) don't linger.
    timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // Process may have already exited
      }
    }, timeout);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", () => {
      clearTimeout(timer);
      resolve({ status: "error", stdout, stderr, timedOut: false });
    });

    child.on("close", () => {
      clearTimeout(timer);

      if (timedOut) {
        resolve({ status: "error", stdout, stderr, timedOut: true });
        return;
      }

      // child.exitCode is set after close
      const code = child.exitCode;

      if (code === 0) {
        resolve({ status: "handled", stdout, stderr, timedOut: false });
      } else if (code === 1) {
        resolve({ status: "pass", stdout, stderr, timedOut: false });
      } else {
        resolve({ status: "error", stdout, stderr, timedOut: false });
      }
    });
  });
}
