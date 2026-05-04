import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

if (!fs.existsSync(buildDir)) {
  console.error(`Missing build output at ${buildDir}`);
  console.error("Run `npm run build` in the web folder on a machine where Vite can start.");
  process.exit(1);
}

function safePathFromUrl(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return normalized === path.sep ? "index.html" : normalized.replace(/^[/\\]/, "");
}

function sendFile(res, filePath, statusCode = 200) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[ext] || "application/octet-stream";
  res.writeHead(statusCode, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const relativePath = safePathFromUrl(req.url);
  const requestedFile = path.join(buildDir, relativePath);

  if (!requestedFile.startsWith(buildDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  if (fs.existsSync(requestedFile) && fs.statSync(requestedFile).isFile()) {
    sendFile(res, requestedFile);
    return;
  }

  const spaEntry = path.join(buildDir, "index.html");
  sendFile(res, spaEntry);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Static frontend available at http://${host}:${port}`);
  console.log("Serving the existing web/build output with SPA fallback.");
});
