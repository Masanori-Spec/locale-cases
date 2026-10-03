import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("web"),
  port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};
const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    const url = new URL(req.url, "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    res
      .writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      })
      .end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Locale Cases local browser: http://127.0.0.1:${port}`),
);
