// Config loader: resolves configuration from multiple sources in priority order.
// CLI args > defaults for now. Additional layers (env, file, external command) will be added.

import { parseArgs } from "node:util";
import defaults from "./defaults.js";
import {
  buildParseArgsOptions,
  extractCliValues,
  validate,
  validateMutualExclusion,
} from "./schema.js";

// Parse CLI arguments using node:util parseArgs
export function parseCli(argv = process.argv.slice(2)) {
  const options = buildParseArgsOptions();
  const { values } = parseArgs({ options, strict: true, args: argv });
  return values;
}

// Merge config layers in priority order (last spread wins).
// Returns { config, explicitKeys } where explicitKeys tracks which
// keys were explicitly set by any source above defaults.
export function loadConfig(cliValues = {}) {
  const explicitKeys = new Set(Object.keys(cliValues));
  const cliConfig = extractCliValues(cliValues);

  const config = {
    ...defaults,
    ...cliConfig,
  };

  validateMutualExclusion(explicitKeys);
  validate(config);

  return Object.freeze(config);
}
