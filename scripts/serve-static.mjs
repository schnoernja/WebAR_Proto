import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".glb": "model/gltf-binary",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
});

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const root = path.resolve(process.cwd(), readArgument("--root", "."));
const host = readArgument("--host", "127.0.0.1");
const port = Number.parseInt(readArgument("--port", "4173"), 10);
const baseArgument = readArgument("--base", "/");
const basePath = `/${baseArgument.replace(/^\/+|\/+$/g, "")}${baseArgument === "/" ? "" : "/"}`;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Ungültiger Port.");
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || host}`);
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    if (!decodedPath.startsWith(basePath)) {
      response.writeHead(404).end("Not Found");
      return;
    }
    const pathBelowBase = decodedPath.slice(basePath.length);
    const relativePath = pathBelowBase ? pathBelowBase.replace(/^\/+/, "") : "index.html";
    const absolutePath = path.resolve(root, relativePath);
    const relativeToRoot = path.relative(root, absolutePath);

    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      response.writeHead(404).end("Not Found");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": fileStat.size,
      "Content-Type": MIME_TYPES[path.extname(absolutePath).toLowerCase()] || "application/octet-stream"
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(absolutePath).pipe(response);
  } catch (error) {
    const status = error && error.code === "ENOENT" ? 404 : 400;
    response.writeHead(status).end(status === 404 ? "Not Found" : "Bad Request");
  }
});

server.listen(port, host, () => {
  console.log(`Statische Dateien aus ${root}`);
  console.log(`http://${host}:${port}${basePath}`);
});
