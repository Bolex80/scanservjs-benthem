import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createTestServer } from './test-server.mjs';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  if (!server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

async function createHarness(t, backendHandler) {
  const distDir = await mkdtemp(join(tmpdir(), 'scanservjs-test-server-'));
  await writeFile(join(distDir, 'index.html'), '<!doctype html><title>test client</title>');

  const backend = http.createServer(backendHandler);
  const backendPort = await listen(backend);
  const proxy = createTestServer({
    distDir,
    apiBase: `http://127.0.0.1:${backendPort}`
  });
  const proxyPort = await listen(proxy);

  t.after(async () => {
    await close(proxy);
    await close(backend);
    await rm(distDir, { recursive: true, force: true });
  });

  return `http://127.0.0.1:${proxyPort}`;
}

test('serves the built index.html from the configured dist directory', async t => {
  const base = await createHarness(t, (req, res) => {
    res.writeHead(500).end();
  });

  const response = await fetch(`${base}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html\b/);
  assert.equal(await response.text(), '<!doctype html><title>test client</title>');
});

test('forwards method, query, body and content type and returns JSON', async t => {
  const base = await createHarness(t, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    res.writeHead(201, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Backend-Proof': 'stub'
    });
    res.end(JSON.stringify({
      method: req.method,
      url: req.url,
      contentType: req.headers['content-type'],
      body
    }));
  });

  const response = await fetch(`${base}/api/v1/scan?one=1&two=a%20b`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Proof': 'browser'
    },
    body: JSON.stringify({ deviceId: 'scanner', resolution: 300 })
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-backend-proof'), 'stub');
  assert.deepEqual(await response.json(), {
    method: 'POST',
    url: '/api/v1/scan?one=1&two=a%20b',
    contentType: 'application/json',
    body: '{"deviceId":"scanner","resolution":300}'
  });
});

test('streams binary thumbnail responses without changing bytes', async t => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x25, 0x50, 0x44, 0x46, 0xff, 0xd9]);
  const base = await createHarness(t, (req, res) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/api/v1/files/example.pdf/thumbnail?size=128');
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': bytes.length
    });
    res.end(bytes);
  });

  const response = await fetch(`${base}/api/v1/files/example.pdf/thumbnail?size=128`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});

test('also proxies the backend API documentation endpoints', async t => {
  const base = await createHarness(t, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: req.url }));
  });

  const response = await fetch(`${base}/api-docs/swagger.json?x=1`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: '/api-docs/swagger.json?x=1' });
});
