/**
 * Signing in: the first-run screen, passwords, and the sign-in method in
 * Settings. On a database of its own, started empty, the way a fresh clone
 * starts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-auth-'));
process.env.DB_PATH = path.join(dir, 'cms.db');
delete process.env.AUTH_DISABLED;
const { createApp } = await import('../src/app.js');
const { run, get, setting } = await import('../src/db/index.js');
const settings = await import('../src/lib/settings.js');
const auth = await import('../src/lib/auth.js');
const { hashPassword, verifyPassword, needsRehash, passwordProblem } = await import('../src/lib/password.js');

const server = await new Promise((resolve) => {
  const s = createApp().listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const post = (url, fields, cookie = '') => fetch(base + url, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
  body: new URLSearchParams(fields).toString(),
});
const sessionOf = (res) => res.headers.get('set-cookie')?.match(/slice_session=[^;]+/)?.[0] || '';

test('a password hash verifies, refuses, and carries its own cost', async () => {
  const hash = await hashPassword('correct horse');
  assert.match(hash, /^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
  assert.equal(await verifyPassword('correct horse', hash), true);
  assert.equal(await verifyPassword('correct hors', hash), false);
  // No hash is never a match, however the password is spelled.
  assert.equal(await verifyPassword('', ''), false);
  assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
  assert.equal(needsRehash(hash), false);
  assert.equal(needsRehash(hash.replace('$32768$', '$1024$')), true);
  assert.notEqual(await hashPassword('correct horse'), hash, 'salted');
});

test('a new password is long enough and typed the same twice', () => {
  assert.match(passwordProblem('short'), /at least 8/);
  assert.match(passwordProblem('x'.repeat(201)), /at most/);
  assert.match(passwordProblem('long enough', 'long enougj'), /do not match/);
  assert.equal(passwordProblem('long enough', 'long enough'), '');
});

test('first run: from another machine it wants the token printed at start', () => {
  const remote = { ip: '203.0.113.9', headers: {} };
  assert.equal(auth.maySetUp(remote, ''), false);
  assert.equal(auth.maySetUp(remote, 'guess'), false);
  assert.equal(auth.maySetUp(remote, auth.setupToken()), true);
  assert.equal(auth.maySetUp({ ip: '127.0.0.1', headers: {} }, ''), true);
});

test('first run: with no admin the CMS sends everyone to make one', async () => {
  assert.equal(auth.needsSetup(), true);
  const cms = await fetch(`${base}/cms`, { redirect: 'manual' });
  assert.equal(cms.headers.get('location'), '/cms/setup');
  const login = await fetch(`${base}/cms/login`, { redirect: 'manual' });
  assert.equal(login.headers.get('location'), '/cms/setup');
  assert.match(await (await fetch(`${base}/cms/setup`)).text(), /Create the first account/);

  const weak = await post('/cms/setup', { email: 'owner@example.com', password: 'short', confirm: 'short' });
  assert.match(await weak.text(), /at least 8 characters/);
  assert.equal(auth.needsSetup(), true);

  const made = await post('/cms/setup', {
    full_name: 'Owner', email: 'Owner@Example.com', password: 'a long password', confirm: 'a long password',
  });
  assert.equal(made.status, 303);
  assert.equal(made.headers.get('location'), '/cms');
  assert.ok(sessionOf(made), 'signed straight in');
  const owner = get('SELECT * FROM users WHERE email = ?', 'owner@example.com');
  assert.equal(owner.role, 'admin');
  assert.match(owner.password_hash, /^scrypt\$/);

  // Once, and never again.
  assert.equal(auth.needsSetup(), false);
  assert.equal((await fetch(`${base}/cms/setup`, { redirect: 'manual' })).headers.get('location'), '/cms/login');
  const again = await post('/cms/setup', { email: 'intruder@example.com', password: 'a long password', confirm: 'a long password' });
  assert.equal(again.headers.get('location'), '/cms/login');
  assert.equal(get('SELECT 1 FROM users WHERE email = ?', 'intruder@example.com'), undefined);
});

test('a password signs in; a wrong one or an unknown address says the same thing', async () => {
  auth.resetThrottle();
  const wrong = await post('/cms/login', { identifier: 'owner@example.com', password: 'not it at all' });
  const nobody = await post('/cms/login', { identifier: 'nobody@example.com', password: 'not it at all' });
  const [a, b] = [await wrong.text(), await nobody.text()];
  assert.match(a, /do not match/);
  assert.match(b, /do not match/);
  assert.equal(sessionOf(wrong), '');

  const right = await post('/cms/login', { identifier: 'owner@example.com', password: 'a long password' });
  assert.equal(right.status, 303);
  const cookie = sessionOf(right);
  assert.equal((await fetch(`${base}/cms/account`, { headers: { Cookie: cookie } })).status, 200);
});

test('five wrong guesses at one address shut it for a while', async () => {
  auth.resetThrottle();
  for (let i = 0; i < 5; i++) await post('/cms/login', { identifier: 'owner@example.com', password: `guess ${i}!` });
  const blocked = await post('/cms/login', { identifier: 'owner@example.com', password: 'a long password' });
  assert.match(await blocked.text(), /Too many attempts/);
  assert.equal(sessionOf(blocked), '');
  auth.resetThrottle();
});

test('Account changes your own password, and wants the old one first', async () => {
  auth.resetThrottle();
  const cookie = sessionOf(await post('/cms/login', { identifier: 'owner@example.com', password: 'a long password' }));
  const other = sessionOf(await post('/cms/login', { identifier: 'owner@example.com', password: 'a long password' }));

  const refused = await post('/cms/account/password',
    { current: 'wrong one', password: 'a newer password', confirm: 'a newer password' }, cookie);
  assert.equal(refused.headers.get('location'), '/cms/account?note=wrong');

  const changed = await post('/cms/account/password',
    { current: 'a long password', password: 'a newer password', confirm: 'a newer password' }, cookie);
  assert.equal(changed.headers.get('location'), '/cms/account?note=saved');
  // This session stays, every other one ends.
  assert.equal((await fetch(`${base}/cms/account`, { headers: { Cookie: cookie }, redirect: 'manual' })).status, 200);
  assert.equal((await fetch(`${base}/cms/account`, { headers: { Cookie: other }, redirect: 'manual' })).status, 303);

  const signedIn = await post('/cms/login', { identifier: 'owner@example.com', password: 'a newer password' });
  assert.equal(signedIn.status, 303);
});

test('the sign-in method decides what the screen asks for and what it accepts', async () => {
  auth.resetThrottle();
  settings.set('signin_method', 'code');
  assert.doesNotMatch(await (await fetch(`${base}/cms/login`)).text(), /type="password"/);
  const byPassword = await post('/cms/login', { identifier: 'owner@example.com', password: 'a newer password' });
  assert.equal(sessionOf(byPassword), '', 'a password is not a way in when codes are');
  assert.match(await byPassword.text(), /one-time code/);

  settings.set('signin_method', 'either');
  const either = await (await fetch(`${base}/cms/login`)).text();
  assert.match(either, /type="password"/);
  assert.match(either, /Send me a code instead/);
  assert.match(await (await post('/cms/login', { identifier: 'owner@example.com', via: 'code' })).text(),
    /Enter the one-time code/);

  settings.set('signin_method', 'password');
  const noCodes = await post('/cms/verify', { identifier: 'owner@example.com', code: '123456' });
  assert.equal(noCodes.headers.get('location'), '/cms/login');
});

test('an old install, whose people have no passwords, keeps signing in by code', () => {
  setting.set('signin_method', '');
  run("UPDATE users SET password_hash = ''");
  auth.keepCodeForOldInstalls();
  assert.equal(auth.signInMethod(), 'code');

  // Once a choice is stored it is left alone.
  settings.set('signin_method', 'either');
  auth.keepCodeForOldInstalls();
  assert.equal(auth.signInMethod(), 'either');
});
