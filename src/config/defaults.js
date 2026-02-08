// Default configuration values for the IMDS server.
// These are the lowest-priority layer in the config resolution chain.

const defaults = Object.freeze({
  host: "127.0.0.1",
  port: 80,
  socket: null,
  tokenTtl: 21600,
  configFile: null,
  configCommand: null,
  configCommandTimeout: 5000,
  logLevel: "info",
});

export default defaults;
