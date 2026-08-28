// Handler chain: registers multiple handlers per request type and executes
// them sequentially until one handles the request or an error occurs.
//
// Follows the chain of responsibility pattern (like Express middleware).
// Only "pass" (exit 1) continues the chain — every other outcome is that
// handler's final answer for the request, so the chain stops there.

// Statuses that end the chain. A handler that claims the request, however it
// turns out, has spoken for it; later handlers must not second-guess the result.
const TERMINAL = new Set(["handled", "error", "retry", "needs-attention"]);

export class HandlerChain {
  constructor({ timeout, executor }) {
    this.timeout = timeout;
    this.executor = executor;
    this.handlers = new Map();
  }

  // Register a handler command for a request type. Handlers are called
  // in registration order when a request of that type comes in.
  // Optional timeout overrides the global default for this handler.
  register(requestType, command, { timeout } = {}) {
    if (!this.handlers.has(requestType)) {
      this.handlers.set(requestType, []);
    }
    this.handlers.get(requestType).push({ command, timeout });
  }

  // Execute the handler chain for a request type. Returns the result from the
  // first handler that does anything other than pass. Returns
  // { status: "no-handler" } if no handlers are registered or all of them pass.
  async execute(requestType, request) {
    const entries = this.handlers.get(requestType);
    if (!entries || entries.length === 0) {
      return { status: "no-handler", stdout: "", stderr: "" };
    }

    for (const entry of entries) {
      const result = await this.executor(entry.command, request, {
        timeout: entry.timeout ?? this.timeout,
      });

      if (TERMINAL.has(result.status)) {
        return { ...result, command: entry.command };
      }
    }

    return { status: "no-handler", stdout: "", stderr: "" };
  }
}
