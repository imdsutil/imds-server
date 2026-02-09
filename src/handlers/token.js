// IMDSv2 token endpoint handler: issues session tokens for authenticated metadata requests.
//
// Implements AWS IMDSv2 token acquisition via PUT /latest/api/token.
// Tokens provide session-based authentication to protect against SSRF and proxy attacks.

const TTL_HEADER = "x-aws-ec2-metadata-token-ttl-seconds";
const FORWARDED_HEADER = "x-forwarded-for";

export async function tokenHandler(req, res, context) {
  const { config, tokenStore, logger } = context;

  // IMDSv1-only mode: token endpoint returns 403 to signal v2 is disabled
  if (config.imdsVersion === "1") {
    logger.debug("Token request rejected: IMDSv1-only mode");
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("IMDSv2 is disabled\n");
    return;
  }

  // Anti-proxy protection: reject requests forwarded through proxies.
  // AWS IMDSv2 refuses to issue tokens if X-Forwarded-For is present.
  if (req.headers[FORWARDED_HEADER]) {
    logger.debug("Token request rejected: X-Forwarded-For header present");
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden\n");
    return;
  }

  // Extract and validate TTL from required header
  const ttlHeader = req.headers[TTL_HEADER];
  if (!ttlHeader) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request: X-aws-ec2-metadata-token-ttl-seconds header required\n");
    return;
  }

  const ttl = parseInt(ttlHeader, 10);
  if (isNaN(ttl) || ttl < 1 || ttl > 21600) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request: TTL must be between 1 and 21600 seconds\n");
    return;
  }

  // Generate and return session token
  const token = tokenStore.createToken(ttl);
  logger.debug("Token created", { ttl });

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(token);
}
