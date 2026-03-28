// Status endpoint: confirms the server is running.
// Not part of any IMDS spec — used for health checks and e2e test verification.

export async function statusHandler(_req, res) {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ok\n");
}
