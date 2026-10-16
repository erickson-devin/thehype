/* Music Integration (frontend lib/auto-music.js): two ordinary profile settings, `musicWebhookUrl`
   and `musicDeepLink`. They ride in the user's own state document, so "saves to the database" means:
   they come back from GET /api/data, they are in that user's state file, and one user's setup never
   shows up for another. Real server.js in a child, like the admin-state tests. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const ORIGIN = 'http://localhost:8080';
const ALICE = 'u_alice_1', BOB = 'u_bob_1';

function mintSession(uid) {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}
const as = uid => ({ Cookie: `gymsid=${mintSession(uid)}`, 'Content-Type': 'application/json', Origin: ORIGIN });

async function startServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-music-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [{ id: ALICE, name: 'Alice', created: new Date().toISOString() }, { id: BOB, name: 'Bob', created: new Date().toISOString() }],
    creds: [], subs: [], invites: []
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost' }
  });
  const h = { api: '', log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.port = await boundPort(child, () => h.log);
  h.api = `http://127.0.0.1:${h.port}`;
  h.put = async (uid, state, baseRev) => {
    const r = await fetch(`${h.api}/api/data`, { method: 'PUT', headers: as(uid), body: JSON.stringify({ state, ...(baseRev != null ? { baseRev } : {}) }) });
    return { status: r.status, body: await r.json() };
  };
  h.get = async uid => { const r = await fetch(`${h.api}/api/data`, { headers: as(uid) }); return { status: r.status, body: await r.json() }; };
  return h;
}
const doc = over => ({ unit: 'kg', workouts: [], routines: [], ...over });

test('a profile\'s music setup is saved, returned, and written to that user\'s own state file', async t => {
  const h = await startServer(t);
  const put = await h.put(ALICE, doc({ musicWebhookUrl: 'http://192.168.1.20:5000/start-music', musicDeepLink: 'spotify:playlist:abc' }));
  assert.equal(put.status, 200, JSON.stringify(put.body));
  const got = await h.get(ALICE);
  assert.equal(got.status, 200);
  assert.equal(got.body.state.musicWebhookUrl, 'http://192.168.1.20:5000/start-music');
  assert.equal(got.body.state.musicDeepLink, 'spotify:playlist:abc');
  const onDisk = JSON.parse(fs.readFileSync(path.join(h.dataDir, `state-${ALICE}.json`), 'utf8'));
  assert.equal(onDisk.musicWebhookUrl, 'http://192.168.1.20:5000/start-music');
  assert.equal(onDisk.musicDeepLink, 'spotify:playlist:abc');
  assert.equal(h.log.split('\n').filter(l => /^\s+at /.test(l)).length, 0, h.log);
});

test('each user on the instance keeps their own setup', async t => {
  const h = await startServer(t);
  assert.equal((await h.put(ALICE, doc({ musicDeepLink: 'spotify:playlist:alice' }))).status, 200);
  assert.equal((await h.put(BOB, doc({ musicWebhookUrl: 'https://hooks.example.com/bob-play' }))).status, 200);
  const a = (await h.get(ALICE)).body.state, b = (await h.get(BOB)).body.state;
  assert.equal(a.musicDeepLink, 'spotify:playlist:alice');
  assert.equal(a.musicWebhookUrl, undefined);
  assert.equal(b.musicWebhookUrl, 'https://hooks.example.com/bob-play');
  assert.equal(b.musicDeepLink, undefined);
});

test('changing and clearing a field persists, and a later save keeps the other one', async t => {
  const h = await startServer(t);
  const first = await h.put(ALICE, doc({ musicWebhookUrl: 'http://a.local/play', musicDeepLink: 'spotify:playlist:abc' }));
  const second = await h.put(ALICE, doc({ musicWebhookUrl: '', musicDeepLink: 'spotify:playlist:abc' }), first.body.rev);
  assert.equal(second.status, 200, JSON.stringify(second.body));
  const s = (await h.get(ALICE)).body.state;
  assert.equal(s.musicWebhookUrl, '');
  assert.equal(s.musicDeepLink, 'spotify:playlist:abc');
});
