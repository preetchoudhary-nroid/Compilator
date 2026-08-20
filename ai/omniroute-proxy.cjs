#!/usr/bin/env node
/**
 * ai/omniroute-proxy.cjs
 * ---------------------
 * Minimal local proxy that listens on 127.0.0.1:8317 and forwards
 * requests to a configured upstream AI server. This lets VS Code's
 * Cline/OmniRoute extension talk to a local endpoint while the proxy
 * forwards to a real provider (cloud or local) defined by environment
 * variable `AI_PROXY_TARGET` or `AI_SERVER_URL`.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const LISTEN_HOST = process.env.AI_PROXY_HOST || '127.0.0.1';
const LISTEN_PORT = Number(process.env.AI_PROXY_PORT || 8317);
const TARGET = process.env.AI_PROXY_TARGET || process.env.AI_SERVER_URL;

if (!TARGET) {
  console.error('AI proxy: no target configured. Set AI_PROXY_TARGET or AI_SERVER_URL.');
  process.exit(1);
}

console.log(`AI proxy: forwarding local http://${LISTEN_HOST}:${LISTEN_PORT} -> ${TARGET}`);

const targetUrl = new URL(TARGET);
const targetIsHttps = targetUrl.protocol === 'https:';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // Build upstream request options
  const upstreamOptions = {
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetIsHttps ? 443 : 80),
    path: (targetUrl.pathname || '') + (req.url || ''),
    method: req.method,
    headers: Object.assign({}, req.headers, {
      host: targetUrl.host,
    }),
  };

  // If incoming request has a body, pipe it upstream
  const upstreamReq = (targetIsHttps ? https : http).request(upstreamOptions, (upstreamRes) => {
    // Forward status and headers
    const headers = Object.assign({}, upstreamRes.headers);
    // Ensure CORS-friendly headers for local clients
    headers['access-control-allow-origin'] = headers['access-control-allow-origin'] || '*';
    res.writeHead(upstreamRes.statusCode || 200, headers);
    upstreamRes.pipe(res);
  });

  upstreamReq.on('error', (err) => {
    console.error('AI proxy upstream error:', err.message || err);
    if (err && err.code === 'ECONNREFUSED') {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Upstream connection refused: ${upstreamOptions.hostname}:${upstreamOptions.port}` }));
      return;
    }
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || String(err) }));
  });

  req.pipe(upstreamReq);
});

server.on('clientError', (err, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`AI proxy listening on http://${LISTEN_HOST}:${LISTEN_PORT}`);
});
