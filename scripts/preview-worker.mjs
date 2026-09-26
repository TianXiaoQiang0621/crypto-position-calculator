import http from "node:http";
import worker from "../dist/server/index.js";

const port = Number(process.env.PORT || 4173);
const server = http.createServer(async (request, response) => {
  const url = `http://127.0.0.1:${port}${request.url}`;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const result = await worker.fetch(new Request(url, { method: request.method, headers: request.headers, body }));
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(Buffer.from(await result.arrayBuffer()));
});
server.listen(port, "127.0.0.1", () => console.log(`Local: http://127.0.0.1:${port}/`));
