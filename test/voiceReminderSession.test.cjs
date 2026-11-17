const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, requireFn) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: requireFn, Date, Map, Set });
 return exports;
}
const parser = load('src/services/voiceCommand.ts');
const { createVoiceReminderHandler } = load('src/services/voiceReminderSession.ts', () => parser);
function harness() {
 const h = { proposal:null, readback:'', saves:0, responses:[], allowed:true, reject:0, fail:false };
 h.handle = createVoiceReminderHandler({
  async authorized() { return h.allowed; },
  async parsed(id,title,date,readback) { h.proposal = { id, title, date }; h.readback=readback; },
  async rejected() { h.reject++; },
  async saved(id,ok) { h.responses.push(ok); },
  async save() { if(h.fail) throw Error('storage failure'); h.saves++; },
 });
 return h;
}
const command = { id:'session', kind:'parse', text:'Remind me to call Mom tomorrow at 3 PM' };
test('valid command is read back but never saves until a separately authorized confirmation', async () => {
 const h=harness(); await h.handle(command);
 assert.equal(h.saves,0); assert.match(h.readback,/call Mom/); assert.match(h.readback,/Say yes/);
 await h.handle({ ...h.proposal, kind:'save' });
 assert.equal(h.saves,1); assert.deepEqual(h.responses,[true]);
});
test('ambiguous command, missing proposal, cancellation and payload mismatch do not save', async () => {
 const h=harness(); await h.handle({ ...command, text:'Remind me tomorrow' }); assert.equal(h.reject,1);
 await h.handle({id:'session',kind:'save',title:'Call Mom',date:'2027-01-01'}); assert.equal(h.saves,0);
 await h.handle(command); h.allowed=false; await h.handle({...h.proposal,kind:'save'}); assert.equal(h.saves,0);
 h.allowed=true; await h.handle({...h.proposal,kind:'save',title:'Changed after readback'}); assert.equal(h.saves,0);
});
test('duplicate confirmation cannot save twice and failed persistence never reports success', async () => {
 const h=harness(); await h.handle(command); const save={...h.proposal,kind:'save'};
 await h.handle(save); await h.handle(save); assert.equal(h.saves,1);
 const failed=harness();failed.fail=true;await failed.handle(command);await failed.handle({...failed.proposal,kind:'save'});
 assert.equal(failed.saves,0); assert.deepEqual(failed.responses,[false]);
});
test('a new command invalidates the old unconfirmed proposal', async () => {
 const h=harness(); await h.handle(command);const old={...h.proposal,kind:'save'};
 await h.handle({...command,id:'new-session'}); await h.handle(old);assert.equal(h.saves,0);
});
