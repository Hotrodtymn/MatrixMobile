const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(native) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('modules/hey-matrix/index.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, setTimeout: callback => { callback(); }, Promise, Error, require: () => ({ requireOptionalNativeModule: () => native }) });
  return exports;
}
test('push-to-talk waits for native microphone cleanup even after an error', async () => {
  let stopped = false, reads = 0;
  const api = load({ async stopListening() { stopped = true; }, getState() { assert.equal(stopped,true); reads++; return { state: 'error', occupied: reads < 3 }; } });
  await api.stopHeyMatrix(); assert.equal(reads,3);
});
test('unreleased microphone blocks handoff instead of starting a second capture', async () => {
  const api = load({ async stopListening() {}, getState() { return { state: 'stopping', occupied: true }; } });
  await assert.rejects(api.stopHeyMatrix(), /still releasing the microphone/);
});
test('old APK without the native wake module preserves push-to-talk', async () => {
  await load(null).stopHeyMatrix();
});
