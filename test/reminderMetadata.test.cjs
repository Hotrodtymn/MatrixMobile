const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const vm=require('node:vm');
const exportsValue={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/reminderMetadata.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsValue});const api=exportsValue;
test('legacy priority and missing/deleted list defaults do not mutate records',()=>{
 const record={id:'old',extra:'keep'};const before=JSON.stringify(record);assert.equal(api.reminderPriority(record),'none');assert.equal(api.reminderPriority({priority:'future'}),'none');assert.equal(api.reminderListId({listId:'deleted'},[]),undefined);assert.equal(JSON.stringify(record),before);
});
test('list priority and completion filters combine without treating occurrence completion as whole-series completion',()=>{
 const lists=[{id:'a',name:'A'},{id:'deleted',name:'Old',deleted:true}];const filter={list:'a',priority:'high',status:'active'};
 assert.equal(api.matchesReminderFilters({listId:'a',priority:'high',completed:false,completedThrough:'2026-01-01'},lists,filter),true);
 assert.equal(api.matchesReminderFilters({listId:'a',priority:'low'},lists,filter),false);
 assert.equal(api.matchesReminderFilters({listId:'a',priority:'high',completed:true},lists,filter),false);
 assert.equal(api.matchesReminderFilters({listId:'deleted'},lists,{list:'unassigned',priority:'none',status:'all'}),true);
 assert.equal(api.matchesReminderFilters({completed:true},lists,{list:'all',priority:'all',status:'completed'}),true);
});
test('priority order is high medium low none with stable ties and no input mutation',()=>{
 const values=[{id:'n'},{id:'l',priority:'low'},{id:'h1',priority:'high'},{id:'m',priority:'medium'},{id:'h2',priority:'high'}];const before=JSON.stringify(values);assert.equal([...values].sort(api.compareReminderPriority).map(item=>item.id).join(','),'h1,h2,m,l,n');assert.equal(JSON.stringify(values),before);
});
