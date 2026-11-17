const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getConfig } = require('expo/config');
const { compileModsAsync } = require('expo/config-plugins');
test('native config keeps wake service private, typed, stoppable and separate from alarm setup', async () => {
  const { exp } = getConfig(process.cwd());
  const result = await compileModsAsync(exp, { projectRoot: process.cwd(), platforms: ['android'], introspect: true });
  const manifest = result._internal.modResults.android.manifest.manifest;
  const app = manifest.application[0];
  const service = app.service.filter(s => s.$['android:name'] === 'expo.modules.heymatrix.HeyMatrixService');
  assert.equal(service.length, 1);
  assert.equal(service[0].$['android:foregroundServiceType'], 'microphone');
  assert.equal(service[0].$['android:exported'], 'false');
  const receiver = app.receiver.find(r => r.$['android:name'] === 'expo.modules.heymatrix.StopListeningReceiver');
  assert.equal(receiver.$['android:exported'], 'false');
  assert.equal(receiver['intent-filter'], undefined); // no boot auto-start
  const permissions = new Set(manifest['uses-permission'].map(p => p.$['android:name']));
  for (const name of ['RECORD_AUDIO','FOREGROUND_SERVICE','FOREGROUND_SERVICE_MICROPHONE','POST_NOTIFICATIONS','WAKE_LOCK']) assert.ok(permissions.has('android.permission.' + name));
  assert.ok(exp.plugins.includes('react-native-alarm-scheduler'));
});
test('bundled engine and model match pinned artifacts for reproducible offline builds', () => {
  const root = path.resolve('modules/hey-matrix');
  const hashes = require('../modules/hey-matrix/artifacts.sha256.json');
  for (const [name, hash] of Object.entries(hashes)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex'), hash, name);
  const assets = path.join(root, 'android/src/main/assets/hey-matrix');
  const vocab = new Set(fs.readFileSync(path.join(assets,'tokens.txt'),'utf8').trim().split('\n').map(line => line.slice(0,line.lastIndexOf(' '))));
  const keyword = fs.readFileSync(path.join(assets,'keywords.txt'),'utf8').trim().split(' :')[0].split(' ');
  assert.ok(keyword.every(token => vocab.has(token)));
  assert.equal(keyword.join('').replaceAll('▁',' ').trim(), 'HEY MATRIX');
  assert.match(fs.readFileSync(path.join(assets,'README.md'),'utf8'), /license: Apache License 2.0/);
});
