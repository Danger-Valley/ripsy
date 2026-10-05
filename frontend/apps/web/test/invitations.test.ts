import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGameInviteUrl, createNativeGameUrl, androidGameIntent, detectInviteDevice, normalizeRoomCode, DEFAULT_TESTFLIGHT_URL, DEFAULT_ANDROID_INSTALL_URL } from '@rps/core/invitations';
import { createInviteQr } from '@rps/core/invite-qr';
import { installUrl, getInviteInstallLinks } from '../app/invite-install-links';
import { InviteQr } from '../app/components/InviteQr';
import { GET as androidAssociation } from '../app/.well-known/assetlinks.json/route';

test('invitations preserve room identity for existing universal/custom links and browser fallback', () => {
  const url = createGameInviteUrl('C50FE81A');
  assert.equal(url, 'https://www.ripsy.fun/game/c50fe81a?invite=1');
  assert.equal(normalizeRoomCode(url), 'c50fe81a');
  assert.equal(createNativeGameUrl('c50fe81a'), 'ripsy://game/c50fe81a');
  for (const value of ['', 'not-a-room', 'https://evil.test/game/abcd1234', 'abcdef123']) assert.equal(normalizeRoomCode(value), null);
  assert.throws(() => createGameInviteUrl('bad'));
  const intent = androidGameIntent('c50fe81a');
  assert.match(intent, /^intent:\/\/game\/c50fe81a#Intent;scheme=ripsy;package=com\.dangervalley\.ripsy;/);
  assert.match(decodeURIComponent(intent), /https:\/\/www\.ripsy\.fun\/game\/c50fe81a\?invite=1&stay=1/);
});
test('device routing covers iPhone, iPad desktop mode, normal Android, explicit Seeker and desktop', () => {
  assert.equal(detectInviteDevice('iPhone'), 'ios');
  assert.equal(detectInviteDevice('Macintosh', 'MacIntel', 5), 'ios');
  assert.equal(detectInviteDevice('Android; Pixel 9'), 'android');
  assert.equal(detectInviteDevice('Android; Seeker'), 'seeker');
  assert.equal(detectInviteDevice('Macintosh', 'MacIntel', 0), 'desktop');
});
test('installation destinations have real defaults and reject unsafe URLs', () => {
  const keys = ['RIPSY_IOS_INSTALL_URL', 'RIPSY_ANDROID_INSTALL_URL', 'RIPSY_SEEKER_INSTALL_URL'];
  const old = keys.map(key => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    assert.deepEqual(getInviteInstallLinks(), { ios: DEFAULT_TESTFLIGHT_URL, android: DEFAULT_ANDROID_INSTALL_URL, seeker: DEFAULT_ANDROID_INSTALL_URL });
    process.env.RIPSY_IOS_INSTALL_URL = 'https://apps.apple.com/app/id6810956586';
    process.env.RIPSY_ANDROID_INSTALL_URL = 'https://play.google.com/store/apps/details?id=com.dangervalley.ripsy';
    process.env.RIPSY_SEEKER_INSTALL_URL = 'https://example.test/seeker';
    assert.equal(getInviteInstallLinks().seeker, 'https://example.test/seeker');
    assert.equal(getInviteInstallLinks().ios, process.env.RIPSY_IOS_INSTALL_URL);
    for (const url of ['javascript:alert(1)', 'http://example.test', 'https://user:secret@example.test', 'bad-url']) assert.equal(installUrl(url, DEFAULT_TESTFLIGHT_URL), DEFAULT_TESTFLIGHT_URL);
  } finally { keys.forEach((key, i) => { if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i]; }); }
});
test('native and web use the same QR matrix with an unobstructed quiet zone', () => {
  const qr = createInviteQr('c50fe81a');
  assert.equal(qr.quietZone, 4);
  assert.ok(qr.runs.every(run => run.x >= 4 && run.y >= 4 && run.x + run.width <= qr.size - 4 && run.y < qr.size - 4));
  const html = renderToStaticMarkup(React.createElement(InviteQr, { gameId: 'c50fe81a' }));
  assert.match(html, /role="img"/);
  assert.match(html, /shape-rendering="crispEdges"/);
  assert.match(html, /fill="white"/);
});
test('install route never mounts socket/join hooks and remains separate from browser play', () => {
  const page = readFileSync(new URL('../app/game/[id]/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /query\.invite === '1'/);
  assert.doesNotMatch(page, /useRipsyGame\(|joinGame\(/);
  const landing = readFileSync(new URL('../app/game/[id]/invite-landing.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(landing, /useRipsyGame\(|joinGame\(/);
  assert.match(landing, /sessionStorage\.getItem\(key\)/);
  assert.match(landing, /visibilityState !== 'visible'/);
  assert.match(landing, /Stay on this page/);
  assert.match(landing, /Rooms can expire/);
});
test('Android association always trusts the distributed APK and validates additional Play certificates', async () => {
  const key = 'ANDROID_APP_SHA256_CERT_FINGERPRINTS';
  const old = process.env[key];
  try {
    delete process.env[key];
    const [record] = await androidAssociation().json();
    assert.equal(record.target.package_name, 'com.dangervalley.ripsy');
    assert.equal(record.target.sha256_cert_fingerprints[0], 'E2:BE:8E:A4:9A:54:47:3B:57:E5:96:88:1B:29:8E:00:44:3B:16:D8:7B:E8:D0:7F:0D:ED:63:1B:66:9A:D5:E5');
    const other = Array(32).fill('AB').join(':');
    process.env[key] = `bad-input, ${other.toLowerCase()}, ${other}`;
    const [configured] = await androidAssociation().json();
    assert.equal(configured.target.sha256_cert_fingerprints.length, 2);
    assert.equal(configured.target.sha256_cert_fingerprints[1], other);
  } finally { if (old === undefined) delete process.env[key]; else process.env[key] = old; }
});
