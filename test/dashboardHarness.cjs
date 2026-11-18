const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function harness(values = {}) {
  const storage = new Map(Object.entries(values));
  const modules = {};
  const writes = [];
  const asyncStorage = { getItem: async key => storage.get(key) ?? null, setItem: async (...args) => { writes.push(args); throw Error('dashboard must not write'); } };
  const nativeNotifications = { setNotificationHandler() {} };
  const tasks = { list: async () => ({tasks: [], skippedCount: 0}) };
  function load(path) {
    if (modules[path]) return modules[path];
    const exports = {}; modules[path] = exports;
    const code = ts.transpileModule(fs.readFileSync(`src/services/${path}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, {exports, Date, Set, Map, Promise, console, require(name) {
      if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: asyncStorage };
      if (name === 'expo-notifications') return nativeNotifications;
      if (name === 'react-native') return {Platform: {OS:'android'}};
      if (name === './taskStorage') return {taskStore:tasks};
      return load(name.replace('./',''));
    }});
    return exports;
  }
  return {api:load('todayDashboard'), snapshot:load('dashboardSnapshot'), storage, writes, asyncStorage, tasks};
}
module.exports = {harness};
