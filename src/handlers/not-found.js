// Default 404 handler for routes that don't match any registered path.

// eslint-disable-next-line no-unused-vars
export async function notFoundHandler(req, res, context) {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found\n");
}
