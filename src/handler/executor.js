// Handler command executor: runs an external command as a subprocess and
// interprets exit codes to determine if the handler provided a response.
//
// Exit code contract:
//   0 - handled: stdout is the response body
//   1 - pass: handler declined, try the next one in the chain
//   2 - error: permanent for this request as posed, stop the chain
//   3 - retry: transient, the same request may succeed later
//   4 - needs-attention: a human must act before this can succeed
//   Any other code is treated as an error.
//
// 2, 3 and 4 all stop the chain but call for different responses: 2 must not
// be retried, 3 should be, and 4 wants a person rather than another attempt.

import { spawn } from "node:child_process";

const EXIT_STATUS = {
  0: "handled",
  1: "pass",
  2: "error",
  3: "retry",
  4: "needs-attention",
};

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
 *   status is one of: handled, pass, error, retry, needs-attention
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

      const status = EXIT_STATUS[code] ?? "error";
      resolve({ status, stdout, stderr, timedOut: false });
    });
  });
}
