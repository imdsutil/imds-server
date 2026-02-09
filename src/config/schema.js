// Config schema: the single source of truth for config key definitions.
// Drives CLI parsing, env var mapping, and validation.

const LOG_LEVELS = ["debug", "info", "warn", "error"];

// Each entry defines a config key and how it's sourced and validated.
// - type: JS typeof expected after coercion
// - cliFlag: the --flag name for node:util parseArgs
// - envVar: the IMDS_ environment variable name
// - coerce: transform raw string input to the correct type
// - validate: return an error message string, or null if valid
const schema = {
  host: {
    type: "string",
    cliFlag: "host",
    envVar: "IMDS_HOST",
    coerce: String,
    validate: (v) =>
      typeof v === "string" && v.length > 0 ? null : "host must be a non-empty string",
  },
  port: {
    type: "number",
    cliFlag: "port",
    envVar: "IMDS_PORT",
    coerce: Number,
    validate: (v) =>
      Number.isInteger(v) && v >= 1 && v <= 65535
        ? null
        : "port must be an integer between 1 and 65535",
  },
  socket: {
    type: "string",
    cliFlag: "socket",
    envVar: "IMDS_SOCKET",
    coerce: String,
    validate: (v) =>
      v === null || (typeof v === "string" && v.length > 0)
        ? null
        : "socket must be a non-empty string or null",
  },
  tokenTtl: {
    type: "number",
    cliFlag: "token-ttl",
    envVar: "IMDS_TOKEN_TTL",
    coerce: Number,
    validate: (v) =>
      Number.isInteger(v) && v >= 1 && v <= 21600
        ? null
        : "tokenTtl must be an integer between 1 and 21600",
  },
  imdsVersion: {
    type: "string",
    cliFlag: "imds-version",
    envVar: "IMDS_VERSION",
    coerce: String,
    validate: (v) =>
      ["1", "2", "auto"].includes(v) ? null : 'imdsVersion must be "1", "2", or "auto"',
  },
  configFile: {
    type: "string",
    cliFlag: "config",
    envVar: "IMDS_CONFIG_FILE",
    coerce: String,
    validate: (v) =>
      v === null || (typeof v === "string" && v.length > 0)
        ? null
        : "configFile must be a non-empty string or null",
  },
  handlerCommand: {
    type: "string",
    cliFlag: "handler-command",
    envVar: "IMDS_HANDLER_COMMAND",
    coerce: String,
    validate: (v) =>
      v === null || (typeof v === "string" && v.length > 0)
        ? null
        : "handlerCommand must be a non-empty string or null",
  },
  handlerCommandTimeout: {
    type: "number",
    cliFlag: "handler-command-timeout",
    envVar: "IMDS_HANDLER_COMMAND_TIMEOUT",
    coerce: Number,
    validate: (v) =>
      Number.isInteger(v) && v >= 100 && v <= 30000
        ? null
        : "handlerCommandTimeout must be an integer between 100 and 30000 (ms)",
  },
  logLevel: {
    type: "string",
    cliFlag: "log-level",
    envVar: "IMDS_LOG_LEVEL",
    coerce: (v) => String(v).toLowerCase(),
    validate: (v) =>
      LOG_LEVELS.includes(v) ? null : `logLevel must be one of: ${LOG_LEVELS.join(", ")}`,
  },
};

// Build the parseArgs options from the schema
export function buildParseArgsOptions() {
  const options = {
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
  };

  for (const [, def] of Object.entries(schema)) {
    options[def.cliFlag] = {
      type: def.type === "number" ? "string" : def.type,
    };
  }

  return options;
}

// Map CLI flag names back to config keys (e.g. 'token-ttl' -> 'tokenTtl')
const flagToKey = Object.fromEntries(
  Object.entries(schema).map(([key, def]) => [def.cliFlag, key]),
);

// Extract config values from parsed CLI args
export function extractCliValues(parsedValues) {
  const result = {};

  for (const [flag, value] of Object.entries(parsedValues)) {
    const key = flagToKey[flag];
    if (key === undefined) continue;

    const def = schema[key];
    result[key] = def.coerce(value);
  }

  return result;
}

// Extract config values from environment variables
export function extractEnvValues(env = process.env) {
  const result = {};

  for (const [key, def] of Object.entries(schema)) {
    const raw = env[def.envVar];
    if (raw === undefined) continue;
    result[key] = def.coerce(raw);
  }

  return result;
}

// Validate a complete config object. Throws on first validation error.
export function validate(config) {
  // Per-key validation
  for (const [key, def] of Object.entries(schema)) {
    if (config[key] === null) continue;
    const error = def.validate(config[key]);
    if (error) {
      throw new Error(`Config validation error: ${error}`);
    }
  }

  // Cross-key validation (socket vs host/port) is handled by
  // validateMutualExclusion, which tracks explicitly-set keys to
  // avoid false positives from default values.
}

// Validate mutual exclusion of socket vs host/port.
// The loader calls this with only explicitly-set keys to avoid
// false positives from default values.
export function validateMutualExclusion(explicitKeys) {
  const hasSocket = explicitKeys.has("socket");
  const hasHostOrPort = explicitKeys.has("host") || explicitKeys.has("port");

  if (hasSocket && hasHostOrPort) {
    throw new Error("Config validation error: --socket and --host/--port are mutually exclusive");
  }
}

export { schema, LOG_LEVELS };
