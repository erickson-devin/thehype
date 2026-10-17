/* A job whose bookkeeping cannot be written must still end: finish() may not throw past the
   queue's catch, and `inflight` must not keep a profile "busy" for the life of the process. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempData, writeState, sampleState } from './helpers.mjs';

const DIR = tempData();
const cfg = await import('../coach/config.js');
const jobs = await import('../coach/jobs.js');
const { forcePrivilegeVerdict } = await import('../coach/adapters/spawn.js');

cfg.save({ enabled: true, provider: 'fixture' });
forcePrivilegeVerdict({ ok: true, dropped: false, why: 'pinned by the test suite' });

const seen = [];
process.on('unhandledRejection', e => seen.push(e));

async function until(fn, ms = 15000) {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (fn()) return;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error('condition never met');
}

test('a coach.json that cannot be written does not strand the job or the profile', async () => {
  const uid = 'u-wf';
  writeState(DIR, uid, sampleState());
  jobs.enqueue(uid, { kind: 'review' });
  fs.mkdirSync(path.join(DIR, 'coach.json.tmp'));
  await until(() => jobs.status(uid).job === null);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(seen.length, 0, String(seen[0]));
  assert.ok(jobs.readUser(uid).history.at(-1).outcome);
  fs.rmdirSync(path.join(DIR, 'coach.json.tmp'));
  let err = null;
  try { jobs.enqueue(uid, { kind: 'review' }); } catch (e) { err = e; }
  assert.notEqual(err?.code, 'busy');
  await until(() => jobs.status(uid).job === null);
});

test('a profile record that cannot be written at enqueue does not leave the profile busy', () => {
  const uid = 'u-wf2';
  writeState(DIR, uid, sampleState());
  fs.mkdirSync(path.join(DIR, 'coach'), { recursive: true });
  const tmp = path.join(DIR, 'coach', uid + '.json.tmp');
  fs.mkdirSync(tmp);
  assert.throws(() => jobs.enqueue(uid, { kind: 'review' }));
  fs.rmdirSync(tmp);
  let err = null;
  try { jobs.enqueue(uid, { kind: 'review' }); } catch (e) { err = e; }
  assert.notEqual(err?.code, 'busy');
});
