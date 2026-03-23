// Handler chain: registers multiple handlers per request type and executes
// them sequentially until one handles the request or an error occurs.
//
// Follows the chain of responsibility pattern (like Express middleware).
// Each handler either handles (exit 0), passes (exit 1), or errors (exit 2).

export class HandlerChain {
  constructor({ timeout, executor }) {
    this.timeout = timeout;
    this.executor = executor;
    this.handlers = new Map();
  }

  // Register a handler command for a request type. Handlers are called
  // in registration order when a request of that type comes in.
  register(requestType, command) {
    if (!this.handlers.has(requestType)) {
      this.handlers.set(requestType, []);
    }
    this.handlers.get(requestType).push(command);
  }

  // Execute the handler chain for a request type. Returns the result from
  // the first handler that handles or errors. Returns { status: "no-handler" }
  // if no handlers are registered or all handlers pass.
  async execute(requestType, request) {
    const commands = this.handlers.get(requestType);
    if (!commands || commands.length === 0) {
      return { status: "no-handler", stdout: "", stderr: "" };
    }

    for (const command of commands) {
      const result = await this.executor(command, request, {
        timeout: this.timeout,
      });

      if (result.status === "handled" || result.status === "error") {
        return result;
      }
    }

    return { status: "no-handler", stdout: "", stderr: "" };
  }
}
