const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = process.cwd();
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

async function main() {
  const server = http.createServer(serveStaticFile);
  await listen(server);

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}/`;
    const postPaths = JSON.parse(fs.readFileSync(path.join(ROOT, "posts.json"), "utf8"));
    const routes = ["", "404.html", "posts.json", "sitemap.xml", "feed.xml", ...postPaths];

    for (const route of routes) {
      const response = await fetch(new URL(route, baseUrl));
      if (!response.ok) {
        throw new Error(`${route || "/"} returned ${response.status}`);
      }
      const contentType = response.headers.get("content-type") || "";
      const expectedType = expectedContentType(route);
      if (!contentType.startsWith(expectedType)) {
        throw new Error(`${route || "/"} returned ${contentType}, expected ${expectedType}`);
      }
      console.log(`${route || "/"} ${response.status} ${contentType}`);
    }
  } finally {
    server.close();
  }
}

function expectedContentType(route) {
  if (route.endsWith(".json")) return "application/json";
  if (route.endsWith(".xml")) return "application/xml";
  return "text/html";
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function serveStaticFile(request, response) {
  const requestUrl = new URL(request.url, "http://127.0.0.1/");
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.resolve(ROOT, `.${decodeURIComponent(pathname)}`);
  const relativePath = path.relative(ROOT, filePath);

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    !fs.existsSync(filePath) ||
    fs.statSync(filePath).isDirectory()
  ) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
