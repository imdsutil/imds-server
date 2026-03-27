// Config loader: resolves configuration from multiple sources in priority order.
// CLI args > env vars > config file > defaults.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import defaults from "./defaults.js";
import {
  buildParseArgsOptions,
  extractCliValues,
  extractEnvValues,
  validate,
  validateHandlers,
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
      throw new Error(`Config file not found: ${filePath}`, { cause: err });
    }
    throw new Error(`Failed to read config file: ${err.message}`, { cause: err });
  }

  let parsed;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`Invalid YAML in config file ${filePath}: ${err.message}`, { cause: err });
  }

  if (parsed === null || parsed === undefined) {
    return {};
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Config file ${filePath} must contain a YAML mapping, not ${typeof parsed}`);
  }

  const result = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "handlers") {
      result.handlers = value;
      continue;
    }
    if (!(key in schema)) continue;
    result[key] = schema[key].coerce(value);
  }

  return result;
}

// Merge config layers in priority order:
// CLI > env > file > defaults.
export function loadConfig(cliValues = {}, env = process.env) {
  const cliConfig = extractCliValues(cliValues);
  const envConfig = extractEnvValues(env);

  // Determine config file path: CLI > env > default
  const explicitConfigFile = cliConfig.configFile ?? envConfig.configFile;
  const rawConfigPath = explicitConfigFile ?? defaults.configFile;
  const configFilePath = rawConfigPath?.startsWith("~/")
    ? homedir() + rawConfigPath.slice(1)
    : rawConfigPath;

  let fileConfig = {};
  if (configFilePath) {
    try {
      fileConfig = loadConfigFile(configFilePath);
    } catch (err) {
      // Only swallow missing file errors for the default path.
      // If the user explicitly set a config file, let it throw.
      if (explicitConfigFile || !err.message.includes("not found")) {
        throw err;
      }
    }
  }

  const explicitKeys = new Set([
    ...Object.keys(cliConfig),
    ...Object.keys(envConfig),
    ...Object.keys(fileConfig),
  ]);

  // Handlers come from config file only (not CLI/env).
  const handlers = fileConfig.handlers ?? defaults.handlers;

  const config = {
    ...defaults,
    ...fileConfig,
    ...envConfig,
    ...cliConfig,
    handlers,
  };

  validateMutualExclusion(explicitKeys);
  validate(config);
  validateHandlers(config.handlers);

  return Object.freeze(config);
}
