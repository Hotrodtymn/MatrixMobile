const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function bridge(os, setter) {
  const exports = {};
  const native = setter ? { setFlipToSilenceEnabledAsync: setter } : {};
  const code = ts.transpileModule(fs.readFileSync('src/services/nativeAlarmSettings.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require(name) { return name === 'react-native' ? { Platform: { OS: os } } : { __esModule: true, default: native }; } });
  return exports;
}
test('Flip to Silence writes native preference and reports refusal', async () => {
  const values = [];
  const api = bridge('android', async enabled => { values.push(enabled); return true; });
  assert.equal(api.supportsFlipToSilence, true);
  await api.setFlipToSilence(true); await api.setFlipToSilence(false);
  assert.deepEqual(values, [true, false]);
  await assert.rejects(bridge('android', async () => false).setFlipToSilence(true), /Could not save/);
  await assert.rejects(bridge('android', async () => { throw Error('native failure'); }).setFlipToSilence(true), /native failure/);
});
test('unsupported platforms and old native binaries do not invoke a missing flip bridge', async () => {
  const old = bridge('android'); assert.equal(old.supportsFlipToSilence, false); await old.setFlipToSilence(true);
  const ios = bridge('ios', async () => { throw Error('must not run'); });
  assert.equal(ios.supportsFlipToSilence, false); await ios.setFlipToSilence(true);
});
// Source contract checks complement the actual Kotlin detector tests; these do not simulate Android.
test('native flip silence stops active playback without cancelling future alarm schedules', () => {
  const source = fs.readFileSync('node_modules/react-native-alarm-scheduler/android/src/main/java/expo/modules/alarm/AlarmSchedulerRingService.kt', 'utf8');
  const sensor = source.split('override fun onSensorChanged')[1].split('private var mediaPlayer')[0];
  assert.match(sensor, /alarmId == null/); assert.match(sensor, /flipPreferences.getBoolean/); assert.match(sensor, /if \(silence\)[\s\S]*stopRinging\(\)/);
  const stop = source.split('private fun stopRinging()')[1].split('// endregion')[0];
  assert.match(stop, /stopPlayback\(\)/); assert.match(stop, /setActiveRingAlarmId\(this, null\)/);
  assert.match(stop, /stopFlipDetection\(\)/); assert.match(stop, /vibrator\?\.cancel\(\)/);
  assert.match(stop, /mediaPlayer\?\.release\(\)/); assert.match(stop, /wakeLock\?\.release\(\)/);
  assert.doesNotMatch(sensor + stop, /AlarmSchedulerScheduler\.|AlarmSchedulerStore\.(?:remove|delete|markComplete)/);
  assert.match(source, /alarmId == null \|\| !enabled/);
  assert.match(source, /getDefaultSensor\(Sensor.TYPE_ACCELEROMETER, true\)/);
});
