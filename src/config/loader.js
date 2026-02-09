// Config loader: resolves configuration from multiple sources in priority order.
// CLI args > env vars > config file > defaults.
// External command layer will be added in a future update.

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import defaults from "./defaults.js";
import {
  buildParseArgsOptions,
  extractCliValues,
  extractEnvValues,
  validate,
  validateMutualExclusion,
  schema,
} from "./schema.js";

// Parse CLI arguments using node:util parseArgs
export function parseCli(argv = process.argv.slice(2)) {
  const options = buildParseArgsOptions();
  const { values } = parseArgs({ options, strict: true, args: argv });
  return values;
}

// Load and parse a YAML config file. Throws on missing file or invalid YAML.
export function loadConfigFile(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`Config file not found: ${filePath}`);
    }
    throw new Error(`Failed to read config file: ${err.message}`);
  }

  let parsed;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`Invalid YAML in config file ${filePath}: ${err.message}`);
  }

  if (parsed === null || parsed === undefined) {
    return {};
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Config file ${filePath} must contain a YAML mapping, not ${typeof parsed}`);
  }

  // Coerce values through the schema
  const result = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in schema)) continue;
    result[key] = schema[key].coerce(value);
  }

  return result;
}

// Merge config layers in priority order: CLI > env > file > defaults.
// explicitKeys tracks keys set by any source above defaults, used for
// mutual exclusion validation.
export function loadConfig(cliValues = {}, env = process.env) {
  const cliConfig = extractCliValues(cliValues);
  const envConfig = extractEnvValues(env);

  // Determine config file path: CLI flag takes priority over env var
  const configFilePath = cliConfig.configFile ?? envConfig.configFile ?? defaults.configFile;
  const fileConfig = configFilePath ? loadConfigFile(configFilePath) : {};

  // Track all explicitly-set keys across layers (everything except defaults)
  const explicitKeys = new Set([
    ...Object.keys(cliConfig),
    ...Object.keys(envConfig),
    ...Object.keys(fileConfig),
  ]);

  const config = {
    ...defaults,
    ...fileConfig,
    ...envConfig,
    ...cliConfig,
  };

  validateMutualExclusion(explicitKeys);
  validate(config);

  return Object.freeze(config);
}
