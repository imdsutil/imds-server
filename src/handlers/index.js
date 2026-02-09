// Static handler registry. Each entry declares a route (method + path) and its handler.
// This is the extension point for adding new IMDS endpoints.
// Handlers are defined separately in their own modules and composed here.

import { notFoundHandler } from "./not-found.js";
import { tokenHandler } from "./token.js";

// Handler registry—populated when concrete handlers are implemented.
// Format: { method, path, handler }
// Paths are matched with longest-prefix-wins semantics.
export const HANDLERS = [{ method: "PUT", path: "/latest/api/token", handler: tokenHandler }];

export { notFoundHandler };
