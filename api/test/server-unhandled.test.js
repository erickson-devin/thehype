/* The API's last-resort crash handler: an unhandled rejection or an uncaught exception is logged
   with its stack, the listener is closed along with every open connection, and the process exits 1
   so the restart policy brings back a clean one. These tests spawn the real server and make it
   fail on purpose. The failure is triggered by a SIGUSR2 that only exists when TEST_CRASH_SEAM is
   set, rather than by a route, because test/openapi-routes.test.js scans the route keys and a
   debug route would have to be documented (and would exist in every deployment). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function start(t, seam) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-crash-'));
  fs.writeFileSync(path.join(dir, 'secret'), crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', TEST_CRASH_SEAM: seam }
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  const exited = new Promise(r => child.once('exit', (code, signal) => r({ code, signal, at: Date.now() })));
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dir, { recursive: true, force: true }); });
  const port = await boundPort(child, () => log);
  return { child, port, api: 'http://127.0.0.1:' + port, log: () => log, exited };
}

async function waitExit(h) {
  const result = await Promise.race([h.exited, new Promise(r => setTimeout(() => r(null), 8000))]);
  assert.ok(result, 'server did not exit:\n' + h.log());
  return result;
}

test('boots and serves with the handler registered; no seam without TEST_CRASH_SEAM', async t => {
  const h = await start(t);
  const r = await fetch(h.api + '/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, users: 0, writable: true });
  await new Promise(r => setTimeout(r, 200));
  assert.equal(h.child.exitCode, null);
  assert.doesNotMatch(h.log(), /shutting down/);
});

test('an unhandled rejection is logged with its stack and the process exits 1, promptly', async t => {
  const h = await start(t, 'rejection');
  assert.equal((await fetch(h.api + '/api/health')).status, 200);
  // A request held in flight: incomplete headers, so a plain close() would wait on headersTimeout.
  const s = net.connect(h.port, '127.0.0.1');
  await once(s, 'connect');
  s.on('error', () => {});
  s.write('GET /api/health HTTP/1.1\r\nHost: x\r\n');
  const t0 = Date.now();
  h.child.kill('SIGUSR2');
  const r = await waitExit(h);
  assert.equal(r.code, 1);
  assert.equal(r.signal, null);
  assert.ok(r.at - t0 < 4000, `exit took ${r.at - t0} ms`);
  assert.match(h.log(), /unhandled rejection: shutting down/);
  assert.match(h.log(), /test seam: unhandled rejection/);
  assert.match(h.log(), /\n\s+at /);
  await assert.rejects(fetch(h.api + '/api/health'));
  s.destroy();
});

test('an uncaught exception takes the same path', async t => {
  const h = await start(t, 'exception');
  const t0 = Date.now();
  h.child.kill('SIGUSR2');
  const r = await waitExit(h);
  assert.equal(r.code, 1);
  assert.equal(r.signal, null);
  assert.ok(r.at - t0 < 4000, `exit took ${r.at - t0} ms`);
  assert.match(h.log(), /uncaught exception: shutting down/);
  assert.match(h.log(), /test seam: uncaught exception/);
});

test('a second rejection during shutdown does not restart the sequence', async t => {
  const h = await start(t, 'double');
  h.child.kill('SIGUSR2');
  const r = await waitExit(h);
  assert.equal(r.code, 1);
  assert.equal((h.log().match(/shutting down/g) || []).length, 1);
  assert.match(h.log(), /unhandled rejection during shutdown/);
  assert.match(h.log(), /test seam: second rejection/);
});
