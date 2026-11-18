const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cache = path.join(os.homedir(), '.gradle/caches/modules-2/files-2.1');
const artifacts = ['org.jetbrains.kotlin/kotlin-compiler-embeddable', 'org.jetbrains.kotlin/kotlin-stdlib', 'org.jetbrains.kotlin/kotlin-script-runtime', 'org.jetbrains.kotlin/kotlin-reflect', 'org.jetbrains/annotations', 'org.jetbrains.intellij.deps/trove4j', 'org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm'];
const jars = artifacts.flatMap(artifact => {
  const dir = path.join(cache, artifact);
  if (!fs.existsSync(dir)) return [];
  const versions = fs.readdirSync(dir).sort((a,b) => b.localeCompare(a, undefined, { numeric: true }));
  return [...fs.globSync(`${dir}/${versions[0]}/*/*.jar`)];
});
if (!jars.some(file => file.includes('kotlin-compiler-embeddable'))) throw new Error('Kotlin compiler not cached; install Kotlin or run this test in the Android build environment.');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-flip-test-'));
const stdlib = jars.find(file => file.split(path.sep).includes('kotlin-stdlib'));
const compile = spawnSync('java', ['-cp', jars.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-classpath', stdlib, '-d', output, 'node_modules/react-native-alarm-scheduler/android/src/main/java/expo/modules/alarm/MatrixFlipDetector.kt', 'test/MatrixFlipDetectorTest.kt'], { stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status || 1);
const run = spawnSync('java', ['-cp', [output, stdlib].join(path.delimiter), 'expo.modules.alarm.MatrixFlipDetectorTestKt'], { stdio: 'inherit' });
process.exit(run.status || 0);
