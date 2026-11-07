#!/usr/bin/env node

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_DIST = fileURLToPath(new URL('../app-ui/dist', import.meta.url));
const DEFAULT_API_BASE = 'http://192.168.2.229:8080';
const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
];

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function isApiPath(pathname) {
  return pathname === '/api'
    || pathname.startsWith('/api/')
    || pathname === '/api-docs'
    || pathname.startsWith('/api-docs/');
}

function withoutHopByHopHeaders(headers) {
  const result = { ...headers };
  const connectionTokens = (headers.connection || '')
    .split(',')
    .map(token => token.trim().toLowerCase())
    .filter(Boolean);
  for (const name of [...HOP_BY_HOP_HEADERS, ...connectionTokens]) {
    delete result[name];
  }
  return result;
}

function proxyRequest(req, res, apiBase) {
  const target = new URL(req.url, apiBase);
  const transport = target.protocol === 'https:' ? https : http;
  const headers = withoutHopByHopHeaders(req.headers);
  headers.host = target.host;

  const upstream = transport.request(target, {
    method: req.method,
    headers
  }, upstreamResponse => {
    const responseHeaders = withoutHopByHopHeaders(upstreamResponse.headers);
    res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
    upstreamResponse.on('error', error => {
      console.error(`Upstream response error: ${error.message}`);
      res.destroy(error);
    });
    upstreamResponse.pipe(res);
  });

  upstream.on('error', error => {
    console.error(`API proxy error for ${req.method} ${req.url}: ${error.message}`);
    if (!res.headersSent) {
      const body = JSON.stringify({ message: `API proxy error: ${error.message}` });
      res.writeHead(502, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
      });
      res.end(body);
    } else {
      res.destroy(error);
    }
  });
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}

async function serveStatic(req, res, distDir, requestUrl) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Malformed URL');
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = resolve(distDir, relativePath);
  if (filePath !== distDir && !filePath.startsWith(`${distDir}${sep}`)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  if (!fileStat.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': fileStat.size,
    'Last-Modified': fileStat.mtime.toUTCString()
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(filePath);
  stream.on('error', error => {
    console.error(`Static file error for ${filePath}: ${error.message}`);
    res.destroy(error);
  });
  stream.pipe(res);
}

export function createTestServer({ distDir = DEFAULT_DIST, apiBase = DEFAULT_API_BASE } = {}) {
  const absoluteDist = resolve(distDir);
  const parsedApiBase = new URL(apiBase);
  if (!['http:', 'https:'].includes(parsedApiBase.protocol)) {
    throw new Error(`API_BASE must use http or https, not ${parsedApiBase.protocol}`);
  }
  if (parsedApiBase.pathname !== '/' || parsedApiBase.search || parsedApiBase.hash) {
    throw new Error('API_BASE must be an origin without a path, query string or fragment');
  }

  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    if (isApiPath(requestUrl.pathname)) {
      proxyRequest(req, res, parsedApiBase);
      return;
    }
    await serveStatic(req, res, absoluteDist, requestUrl);
  });
}

function usage() {
  console.log(`Usage: node scripts/test-server.mjs [dist-dir]

Environment:
  DIST_DIR   Built client directory (default: app-ui/dist)
  API_BASE   Scanner API origin (default: ${DEFAULT_API_BASE})
  HOST       Listen address (default: 127.0.0.1)
  PORT       Listen port (default: 8089)`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }
  if (args.length > 1) {
    usage();
    process.exitCode = 2;
    return;
  }

  const distDir = args[0] || process.env.DIST_DIR || DEFAULT_DIST;
  const apiBase = process.env.API_BASE || DEFAULT_API_BASE;
  const host = process.env.HOST || '127.0.0.1';
  const port = Number.parseInt(process.env.PORT || '8089', 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  const indexPath = resolve(distDir, 'index.html');
  const indexStat = await stat(indexPath);
  if (!indexStat.isFile()) {
    throw new Error(`Not a file: ${indexPath}`);
  }

  const server = createTestServer({ distDir, apiBase });
  server.on('error', error => {
    console.error(`Test server error: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log(`Serving ${resolve(distDir)} at http://${host}:${server.address().port}`);
    console.log(`Proxying /api/* and /api-docs/* to ${apiBase}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
