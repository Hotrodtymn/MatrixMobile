const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Promise,Set});return exports;}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('refresh observer isolates exceptions, coalesces bursts, re-reads concurrent writes and recovers after rejection',async()=>{
 const api=load('src/services/widgetDataEvents.ts');let calls=0,release;
 const request=api.createWidgetRefreshController(async()=>{calls++;if(calls===1)await new Promise(resolve=>{release=resolve;});if(calls===3)throw Error('native unavailable');});
 const stop=api.subscribeWidgetData(request);api.subscribeWidgetData(()=>{throw Error('unrelated observer');});
 api.notifyWidgetDataChanged();api.notifyWidgetDataChanged();await tick();assert.equal(calls,1);
 api.notifyWidgetDataChanged();release();await tick();assert.equal(calls,2);
 api.notifyWidgetDataChanged();await tick();api.notifyWidgetDataChanged();await tick();assert.equal(calls,4);stop();api.notifyWidgetDataChanged();await tick();assert.equal(calls,4);
});
test('Today widget navigation handles cold/warm links, rejects other URLs and cancels deferred startup',async()=>{
 const api=load('src/services/todayWidgetNavigation.ts');let listener,resolveInitial,opens=0,removed=0;
 const source={getInitialURL:()=>new Promise(resolve=>{resolveInitial=resolve;}),addEventListener:(_,fn)=>{listener=fn;return{remove:()=>removed++};}};
 const stop=api.subscribeTodayWidgetLinks(source,()=>opens++);resolveInitial(api.TODAY_WIDGET_URI);await tick();assert.equal(opens,1);
 listener({url:'matrix-today://dashboard/delete'});listener({url:'https://example.com/today'});assert.equal(opens,1);listener({url:api.TODAY_WIDGET_URI});assert.equal(opens,2);stop();assert.equal(removed,1);
 const cancel=api.subscribeTodayWidgetLinks(source,()=>opens++);cancel();resolveInitial(api.TODAY_WIDGET_URI);await tick();assert.equal(opens,2);
});
test('serialized render submissions keep snapshots ordered and recover after failed rendering',async()=>{
 const api=load('src/widgets/widgetRenderQueue.ts');const order=[];let release;
 const first=api.enqueueWidgetRender(async()=>{order.push('old');await new Promise(resolve=>{release=resolve;});});
 const second=api.enqueueWidgetRender(async()=>{order.push('new');});await tick();assert.deepEqual(order,['old']);release();await first;await second;assert.deepEqual(order,['old','new']);
 await assert.rejects(api.enqueueWidgetRender(async()=>{throw Error('render');}));await api.enqueueWidgetRender(async()=>{order.push('recovered');});assert.equal(order[2],'recovered');
});

test('alarm persistence triggers widget only after a successful write, without scheduling',async()=>{
 const text=fs.readFileSync('App.tsx','utf8');const source=ts.createSourceFile('App.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let target;
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='saveAlarms')target=node;ts.forEachChild(node,visit);}visit(source);assert.ok(target);
 const code=ts.transpileModule(target.getText(source)+'\nexports.saveAlarms=saveAlarms;',{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 let writes=0,refreshes=0,updates=0,fail=false;const exports={};
 vm.runInNewContext(code,{exports,ALARMS_KEY:'existing',AsyncStorage:{setItem:async()=>{if(fail)throw Error('storage');writes++;}},setAlarms:()=>updates++,notifyWidgetDataChanged:()=>{assert.equal(writes,1);refreshes++;}});
 await exports.saveAlarms([]);assert.equal(refreshes,1);assert.equal(updates,1);fail=true;await assert.rejects(exports.saveAlarms([]));assert.equal(refreshes,1);
});

test('Today provider preserves verified identity and dimensions with Android-only navigation and bounded periodic metadata',()=>{
 const app=JSON.parse(fs.readFileSync('app.json','utf8')).expo;
 const widget=app.plugins.find(x=>Array.isArray(x)&&x[0]==='react-native-android-widget')[1].widgets[0];
 assert.equal(widget.name,'MatrixCompatibility');assert.equal(widget.label,'Matrix Today');
 assert.equal(widget.minWidth,'180dp');assert.equal(widget.minHeight,'80dp');assert.equal(widget.targetCellWidth,2);assert.equal(widget.targetCellHeight,1);
 assert.equal(widget.updatePeriodMillis,1800000);assert.equal(widget.widgetCategory,'home_screen');assert.equal(widget.resizeMode,'horizontal|vertical');
 assert.equal(app.android.package,'com.hotrodtymn.matrix');assert.equal(app.version,'1.5.0');assert.equal(app.runtimeVersion.policy,'appVersion');
 assert.equal(app.scheme,undefined);assert.ok(app.android.intentFilters.some(x=>x.data.some(d=>d.scheme==='matrix-today'&&d.host==='dashboard'&&d.path==='/today')));
});
