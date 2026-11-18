const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('APK guard rejects broken native widget registration and wrong build identity', () => {
  const result = spawnSync(process.env.PYTHON || 'python', ['test/widget_apk_checks_test.py'], {
    encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
});
