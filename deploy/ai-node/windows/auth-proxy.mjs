// ZekerFlex AI-node (Windows) — security layer in front of Ollama.
//
// Ollama has no authentication of its own, so it never faces the internet
// directly: the Cloudflare tunnel points HERE, and this proxy
//   - requires "Authorization: Bearer <key>" (constant-time compare),
//   - only forwards the few endpoints ZekerFlex needs (no pull/delete/create),
//   - streams responses through unchanged.
//
//   ZF_AI_KEY=<key> node auth-proxy.mjs        (start-ai-node.ps1 does this)
//
// Listens on 127.0.0.1:11500 only. No dependencies.

import http from "node:http";
import { timingSafeEqual } from "node:crypto";

const KEY = process.env.ZF_AI_KEY ?? "";
const PORT = Number(process.env.ZF_PROXY_PORT ?? 11500);
const OLLAMA = new URL(process.env.OLLAMA_URL ?? "http://127.0.0.1:11434");

if (KEY.length < 32) {
  console.error("ZF_AI_KEY ontbreekt of is te kort");
  process.exit(1);
}

const ALLOWED = [
  ["GET", /^\/v1\/models\/?$/],
  ["POST", /^\/v1\/chat\/completions\/?$/],
  ["POST", /^\/v1\/embeddings\/?$/],
  ["GET", /^\/api\/version\/?$/],
];

function authorized(req) {
  const h = req.headers["authorization"] ?? "";
  const given = Buffer.from(h.startsWith("Bearer ") ? h.slice(7) : "");
  const want = Buffer.from(KEY);
  return given.length === want.length && timingSafeEqual(given, want);
}

let served = 0;
const server = http.createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  if (!authorized(req)) {
    res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  if (!ALLOWED.some(([m, re]) => m === req.method && re.test(path))) {
    res.writeHead(403, { "content-type": "application/json" }).end(JSON.stringify({ error: "endpoint not allowed" }));
    return;
  }
  const headers = { ...req.headers, host: OLLAMA.host };
  delete headers["authorization"];
  delete headers["cf-connecting-ip"];
  const upstream = http.request({ hostname: OLLAMA.hostname, port: OLLAMA.port, path: req.url, method: req.method, headers }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  upstream.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `ollama: ${err.message}` }));
  });
  req.pipe(upstream);
  served += 1;
  if (served % 25 === 0) console.log(`[proxy] ${served} verzoeken doorgestuurd`);
});

server.requestTimeout = 0; // CPU answers can take a while
server.listen(PORT, "127.0.0.1", () => console.log(`[proxy] luistert op http://127.0.0.1:${PORT} → ${OLLAMA.origin}`));
