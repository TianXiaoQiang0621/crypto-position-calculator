import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = ["index.html", "styles.css", "app.js", "core.js"];
const assets = {};
for (const file of files) assets[`/${file}`] = await readFile(path.join(root, "dist", file), "utf8");

const runtime = String.raw`
const TYPES = { "/index.html": "text/html; charset=utf-8", "/styles.css": "text/css; charset=utf-8", "/app.js": "text/javascript; charset=utf-8", "/core.js": "text/javascript; charset=utf-8" };

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const asset = ASSETS[path];
    if (asset == null) return new Response("Not found", { status:404 });
    return new Response(asset, { headers:{ "content-type": TYPES[path] || "text/plain; charset=utf-8", "cache-control": path === "/index.html" ? "no-cache" : "public, max-age=3600" } });
  }
};
`;

await mkdir(path.join(root, "dist", "server"), { recursive: true });
await writeFile(path.join(root, "dist", "server", "index.js"), `const ASSETS = ${JSON.stringify(assets)};\n${runtime}`, "utf8");
console.log("worker build complete");
