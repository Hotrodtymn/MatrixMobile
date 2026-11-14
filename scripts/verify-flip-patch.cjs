const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const expected = require('./flip-native-sha256.json');
const root = path.join(__dirname, '..', 'node_modules', 'react-native-alarm-scheduler');
for (const [file, hash] of Object.entries(expected)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  if (actual !== hash) throw new Error(`Matrix flip-v2 patch missing or changed: ${file}`);
}
console.log('Matrix flip-v2: all four native patch source hashes verified before Android compilation.');
