// Handler response envelope: detection and validation.
//
// A handler may write a bare response body, or an envelope carrying facts about
// that body the server needs but cannot infer — expiry, a cache key, why a
// failure happened. See docs/design/handler-envelope.md.
//
// Detection is deliberately narrow: an envelope is a JSON object with an
// integer `imdsEnvelopeVersion`. Everything else is a body, relayed untouched.

const MARKER = "imdsEnvelopeVersion";
const SUPPORTED_VERSION = 1;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Classify a handler's stdout as an envelope or a bare response body.
 *
 * @param {string} stdout - Raw handler output
 * @param {string} status - Executor status the exit code produced
 * @returns {{kind: "body", body: string}
 *   | {kind: "envelope", envelope: object}
 *   | {kind: "invalid", reason: string}}
 */
export function parseHandlerOutput(stdout, status) {
  // Leading whitespace must go before the `{` test. A handler that pretty-prints
  // its envelope would otherwise look like a body and have its control data
  // relayed to the client — and since a body is a legitimate outcome, silently.
  const trimmed = stdout.trimStart();

  if (!trimmed.startsWith("{")) {
    return { kind: "body", body: stdout };
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // A handler emitting malformed JSON as its body is the handler's bug to
    // surface, not ours to intercept. Relay it and let the client complain.
    return { kind: "body", body: stdout };
  }

  if (!isPlainObject(parsed) || !Number.isInteger(parsed[MARKER])) {
    return { kind: "body", body: stdout };
  }

  // Past this point the handler has claimed to speak the protocol, so problems
  // are errors rather than grounds to fall back to relaying the raw bytes.
  if (parsed[MARKER] !== SUPPORTED_VERSION) {
    return {
      kind: "invalid",
      reason: `unsupported envelope version ${parsed[MARKER]}, expected ${SUPPORTED_VERSION}`,
    };
  }

  if (status === "handled" && parsed.body === undefined) {
    return { kind: "invalid", reason: "envelope on a handled response has no body" };
  }

  return { kind: "envelope", envelope: parsed };
}
