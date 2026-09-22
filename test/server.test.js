/**
 * The jobs nginx used to do, asked of the Express app itself: compression,
 * caching, hardened uploads, byte ranges, the upload ceiling. The app is
 * started on a spare port without the clock or the seed, and every request
 * here only reads.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { fromThisMachine } from '../src/lib/auth.js';
import { overTls } from '../src/lib/http.js';

const server = await new Promise((resolve) => {
  const s = createApp().listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;

// A throwaway upload, so /media has something to serve.
const probe = `__server-test-${process.pid}.svg`;
const probePath = path.join(config.paths.media, probe);
fs.writeFileSync(probePath, `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${' '.repeat(2000)}</svg>`);

test.after(() => {
  fs.rmSync(probePath, { force: true });
  server.close();
});

test('a stylesheet goes out compressed, and cached for an hour', async () => {
  const res = await fetch(`${base}/assets/site.css`, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-encoding'), 'gzip');
  assert.match(res.headers.get('cache-control'), /max-age=3600/);
});

test('an upload is served inert and cached for a week', async () => {
  const res = await fetch(`${base}/media/${probe}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-security-policy'), "script-src 'none'; object-src 'none'");
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('cache-control'), /max-age=604800/);
});

test('media answers a byte range, which Safari needs to play a video', async () => {
  const res = await fetch(`${base}/media/${probe}`, { headers: { Range: 'bytes=0-9', 'Accept-Encoding': 'identity' } });
  assert.equal(res.status, 206);
  assert.match(res.headers.get('content-range'), /^bytes 0-9\//);
  assert.equal((await res.arrayBuffer()).byteLength, 10);
});

test('a typeface is immutable for a year, and inert like any upload', async () => {
  const res = await fetch(`${base}/fonts/inter-variable.woff2`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'font/woff2');
  assert.match(res.headers.get('cache-control'), /max-age=31536000.*immutable/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('what is not on disk is a 404, and nothing climbs out of the folder', async () => {
  assert.equal((await fetch(`${base}/media/no-such-file.webp`)).status, 404);
  assert.equal((await fetch(`${base}/media/.gitkeep`)).status, 404);
  assert.ok([403, 404].includes((await fetch(`${base}/media/..%2F..%2Fsrc%2Fconfig.js`)).status));
});

test('an upload past the ceiling is refused before it is read, in JSON', async () => {
  const answer = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/cms/media/upload`, {
      method: 'POST',
      headers: { 'Content-Length': config.uploads.maxRequest + 1, Accept: 'application/json' },
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { req.destroy(); resolve({ status: res.statusCode, body }); });
    });
    req.on('error', reject);
    req.write('x');   // the rest never comes: the answer must not wait for it
  });
  assert.equal(answer.status, 413);
  assert.deepEqual(JSON.parse(answer.body), { error: 'That file is too large to upload.' });
});

test('a method nothing takes is refused', async () => {
  assert.equal((await fetch(`${base}/`, { method: 'PUT' })).status, 405);
});

test('a visitor cannot claim TLS, or claim to be this machine', async () => {
  // Nothing is named in TRUST_PROXY, so a forged header is ignored...
  const res = await fetch(`${base}/cms/login`, { headers: { 'X-Forwarded-Proto': 'https' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('strict-transport-security'), null);
  assert.equal(overTls({ secure: false, headers: { 'x-forwarded-proto': 'https' } }), false);
  assert.equal(overTls({ secure: true, headers: {} }), true);

  // ...and the login bypass asks the socket, not the headers.
  assert.equal(fromThisMachine({ ip: '127.0.0.1', headers: {} }), true);
  assert.equal(fromThisMachine({ ip: '::ffff:127.0.0.1', headers: {} }), true);
  assert.equal(fromThisMachine({ ip: '192.168.1.20', headers: { 'x-forwarded-for': '127.0.0.1' } }), false);
  // A local socket carrying forwarding headers came through a proxy nobody
  // named: whoever is behind it is not this machine.
  assert.equal(fromThisMachine({ ip: '127.0.0.1', headers: { 'x-forwarded-for': '203.0.113.9' } }), false);
  assert.equal(fromThisMachine({ ip: '127.0.0.1', headers: { 'x-real-ip': '203.0.113.9' } }), false);
});
