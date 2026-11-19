const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {harness}=require('./dashboardHarness.cjs');
function load(file,requireModule,globals={}) {
 const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,Date,Promise,Set,Map,setTimeout,clearTimeout,require:requireModule,...globals});return exports;
}
function domain() {
 const h=harness();
 const reminders=load('src/services/reminders.ts',name=>name==='./widgetDataEvents'?{notifyWidgetDataChanged(){}}:name==='expo-notifications'?{setNotificationHandler(){}}:name==='react-native'?{Platform:{OS:'android'}}:{__esModule:true,default:h.asyncStorage});
 const metadata=load('src/services/reminderMetadata.ts',()=>{});
 const model=load('src/widgets/todayWidgetModel.ts',name=>name.endsWith('todayDashboard')?h.api:name.endsWith('reminderMetadata')?metadata:reminders);
 return {h,model};
}
const now=new Date(2027,1,28,12);
const date=(day,hour)=>new Date(2027,1,day,hour).toISOString();
const reminder=(id,extra={})=>({id,title:id,date:date(28,15),notificationId:'keep',...extra});
const alarm=(extra={})=>({id:'a',title:'Wake',hour:14,minute:0,enabled:true,sound:'default',...extra});

test('Today widget uses future local occurrences, priority tie-breaks and snooze without modifying records',()=>{
 const {model}=domain();const input=[reminder('past',{date:date(28,11)}),reminder('low',{priority:'low'}),reminder('high',{priority:'high'}),reminder('legacy'),reminder('done',{completed:true}),reminder('snooze',{date:date(28,10),snoozedUntil:date(28,16)}),reminder('tomorrow',{snoozedUntil:new Date(2027,2,1,10).toISOString()})];
 const before=JSON.stringify(input);const result=model.selectTodayWidget(input,[alarm(),alarm({id:'disabled',enabled:false,hour:13})],now);
 assert.equal(result.rows.map(x=>x.id).join(','),'high,low,legacy,snooze');assert.equal(result.rows[2].priority,'none');assert.match(result.alarm,/Next alarm/);assert.match(result.alarm,/Wake/);assert.equal(JSON.stringify(input),before);
 assert.equal(model.priorityPresentation('high').label,'HIGH');assert.equal(model.priorityPresentation('medium').label,'MED');assert.equal(model.priorityPresentation('low').label,'LOW');assert.equal(model.priorityPresentation('none').label,'');
});

test('Today widget shares monthly clamp, daily, weekly, selected-days and recurring completion semantics',()=>{
 const {model}=domain();const records=[reminder('month',{date:new Date(2027,0,31,15).toISOString(),recurrence:'monthly'}),reminder('daily',{date:date(1,15),recurrence:'daily'}),reminder('week',{date:date(21,15),recurrence:'weekly'}),reminder('selected',{date:date(1,15),recurrence:'selectedDays',weekdays:[now.getDay()]}),reminder('completed',{date:date(1,15),recurrence:'daily',completedThrough:date(28,15)})];
 assert.equal(model.selectTodayWidget(records,[],now).rows.length,4);
 assert.equal(model.selectTodayWidget([reminder('midnight',{date:new Date(2027,2,1,0).toISOString()})],[],new Date(2027,1,28,23,59)).rows.length,0);
});

test('Today widget empty and unknown-alarm states never invent a scheduled time',()=>{
 const {model}=domain();const empty=model.selectTodayWidget([],[],now);assert.equal(empty.rows.length,0);assert.equal(empty.alarm,'No upcoming alarm');
 const invalid=model.selectTodayWidget([],[alarm({weekdays:[]})],now);assert.equal(invalid.warning,true);assert.match(invalid.alarm,/unavailable/);
 const mixed=model.selectTodayWidget([],[alarm({weekdays:[]}),alarm({id:'known'})],now);assert.match(mixed.alarm,/Known alarm/);
 assert.equal(model.selectTodayWidget([reminder('bad',{completed:'false'})],[],now).state,'error');
 assert.equal(model.selectTodayWidget([reminder('bad',{completedThrough:'bad-date'})],[],now).state,'error');
});

test('widget loader handles missing/malformed records without writes or task dependencies',async()=>{
 const {h,model}=domain();h.tasks.list=async()=>{throw Error('unrelated task data');};const loader=load('src/widgets/loadTodayWidget.ts',name=>name.endsWith('todayWidgetModel')?model:h.snapshot);
 assert.equal((await loader.loadTodayWidget()).state,'ready');
 for(const raw of ['{bad','{}','[null]',JSON.stringify([{id:'r',title:'Broken',date:'bad'}])]){
  h.storage.set('matrix.reminders.v1',raw);assert.equal((await loader.loadTodayWidget()).state,'error');assert.equal(h.storage.get('matrix.reminders.v1'),raw);
 }
 assert.equal(h.writes.length,0);
});

test('headless handler reads persisted content on add/update/resize and ignores unrelated/deleted/click events',async()=>{
 const {model}=domain();let reads=0;
 const react={createElement:(type,props,...children)=>({type,props,children})};
 const component=load('src/widgets/MatrixCompatibilityWidget.tsx',name=>name==='react'?{default:react,__esModule:true}:name.endsWith('widgetRenderQueue')?{enqueueWidgetRender:work=>work()}:name.endsWith('loadTodayWidget')?{loadTodayWidget:async()=>{reads++;return model.selectTodayWidget([reminder('Call Mom',{priority:'high'})],[alarm()],now);}}:name.endsWith('todayWidgetModel')?model:name.endsWith('todayWidgetNavigation')?{TODAY_WIDGET_URI:'matrix-today://dashboard/today'}:{FlexWidget:'FlexWidget',TextWidget:'TextWidget'});
 const renders=[];
 for(const event of ['WIDGET_ADDED','WIDGET_UPDATE','WIDGET_RESIZED','WIDGET_DELETED','WIDGET_CLICK'])await component.compatibilityWidgetTaskHandler({widgetInfo:{widgetName:'MatrixCompatibility',height:80},widgetAction:event,renderWidget:value=>renders.push(value)});
 await component.compatibilityWidgetTaskHandler({widgetInfo:{widgetName:'Other'},widgetAction:'WIDGET_ADDED',renderWidget(){throw Error('wrong widget');}});
 assert.equal(reads,3);assert.equal(renders.length,3);assert.ok(renders[0].light);assert.ok(renders[0].dark);
 const layout=component.MatrixTodayWidget(renders[0].light.props);assert.equal(layout.props.clickAction,'OPEN_URI');assert.equal(layout.props.clickActionData.uri,'matrix-today://dashboard/today');
});

test('Android registration is idempotent, refreshes installed widgets after writes/foreground and no-ops elsewhere',async()=>{
 const neutral=load('src/widgets/registerWidget.ts',()=>{throw Error('native import on other platform');});neutral.registerCompatibilityWidget();
 let registered,listener,foreground,updates=0,reads=0;
 const android=load('src/widgets/registerWidget.android.ts',name=>name.endsWith('widgetRenderQueue')?{enqueueWidgetRender:work=>work()}:name==='react-native'?{AppState:{currentState:'background',addEventListener:(_,fn)=>{foreground=fn;}}}:name==='react-native-android-widget'?{registerWidgetTaskHandler:fn=>{registered=fn;},getWidgetInfo:async()=>[{widgetId:4,height:80}],requestWidgetUpdateById:async p=>{updates++;p.renderWidget({height:80});}}:name.endsWith('widgetDataEvents')?{subscribeWidgetData:fn=>{listener=fn;},createWidgetRefreshController:fn=>()=>void fn()}:name.endsWith('loadTodayWidget')?{loadTodayWidget:async()=>{reads++;return {};}}:name.endsWith('todayWidgetModel')?{WIDGET_NAME:'MatrixCompatibility'}:{compatibilityWidgetTaskHandler:()=>{},todayWidgetRepresentation:()=>({})});
 android.registerCompatibilityWidget();android.registerCompatibilityWidget();assert.equal(typeof registered,'function');assert.equal(reads,0);
 listener();await new Promise(resolve=>setImmediate(resolve));assert.equal(updates,1);foreground('background');assert.equal(updates,1);foreground('active');await new Promise(resolve=>setImmediate(resolve));assert.equal(updates,2);
});

module.exports={load};

test('real 0.26 widget renderer accepts ready, empty and error layouts in both themes without Fragments',()=>{
 const {model}=domain();const React=require('react');
 const primitives={...require('../node_modules/react-native-android-widget/lib/commonjs/widgets/FlexWidget'),...require('../node_modules/react-native-android-widget/lib/commonjs/widgets/TextWidget')};
 const {buildWidgetTree}=require('../node_modules/react-native-android-widget/lib/commonjs/api/build-widget-tree');
 const component=load('src/widgets/MatrixCompatibilityWidget.tsx',name=>name==='react'?{default:React,__esModule:true}:name.endsWith('widgetRenderQueue')?{}:name.endsWith('loadTodayWidget')?{}:name.endsWith('todayWidgetModel')?model:name.endsWith('todayWidgetNavigation')?{TODAY_WIDGET_URI:'matrix-today://dashboard/today'}:primitives);
 const snapshot=model.selectTodayWidget([reminder('Call Mom',{priority:'high'})],[alarm()],now);
 const collect=tree=>[tree.props.text,...(tree.children??[]).flatMap(collect)].filter(Boolean);
 for(const light of [true,false])for(const state of [snapshot,model.selectTodayWidget([],[],now),model.widgetError(now)]) {
  const tree=buildWidgetTree(React.createElement(component.MatrixTodayWidget,{model:state,height:80,light}));
  assert.equal(tree.type,'LinearLayoutWidget');const text=collect(tree).join(' | ');
  if(state.state==='error')assert.match(text,/Cannot load Today/);
  else if(state.rows.length){assert.match(text,/Call Mom/);assert.match(text,/HIGH/);}
  else assert.match(text,/No more reminders today/);
 }
});

test('widget reads are bounded and render an explicit error instead of waiting indefinitely',async()=>{
 const {model}=domain();const loader=load('src/widgets/loadTodayWidget.ts',name=>name.endsWith('todayWidgetModel')?model:{readReminderAlarmSnapshot:()=>new Promise(()=>{})}, {setTimeout:fn=>setImmediate(fn),clearTimeout:()=>{}});
 assert.equal((await loader.loadTodayWidget()).state,'error');
});

test('overnight one-time snoozes appear today without resurrecting completed reminders or changing recurrence',()=>{
 const {model}=domain();const morning=new Date(2027,2,14,0,5);
 const overnight={id:'overnight',title:'Later',date:new Date(2027,2,13,23,50).toISOString(),notificationId:'existing',snoozedUntil:new Date(2027,2,14,0,10).toISOString()};
 const input=[overnight,{...overnight,id:'completed',completed:true},{...overnight,id:'cleared',completedThrough:overnight.date},{...overnight,id:'expired',snoozedUntil:new Date(2027,2,14,0,1).toISOString()},{...overnight,id:'tomorrow',snoozedUntil:new Date(2027,2,15,0,10).toISOString()}];
 const before=JSON.stringify(input);const selected=model.selectTodayWidget(input,[],morning);
 assert.equal(selected.rows.map(x=>x.id).join(','),'overnight');assert.equal(JSON.stringify(input),before);
});

test('widget midnight and snoozed-once selection uses local dates across DST and UTC offsets',()=>{
 const {execFileSync}=require('node:child_process');
 const script=`const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm'),ts=require('typescript');const {harness}=require('./test/dashboardHarness.cjs');${load.toString()}\n${domain.toString()}\nconst {model}=domain();const now=new Date(2027,2,14,0,5);const make=(id,date,extra={})=>({id,title:id,date:date.toISOString(),notificationId:'keep',...extra});const data=[make('snooze',new Date(2027,2,13,23,50),{snoozedUntil:new Date(2027,2,14,0,10).toISOString()}),make('today',new Date(2027,2,14,1)),make('tomorrow',new Date(2027,2,15,0))];assert.equal(model.selectTodayWidget(data,[],now).rows.map(x=>x.id).join(','),'snooze,today');const late=new Date(2027,2,14,23,59,30);assert.equal(model.selectTodayWidget([make('edge',new Date(2027,2,14,23,59,45)),data[2]],[],late).rows.map(x=>x.id).join(','),'edge');`;
 for(const TZ of ['America/New_York','Asia/Kolkata','Pacific/Auckland'])execFileSync(process.execPath,['-e',script],{cwd:process.cwd(),env:{...process.env,TZ},stdio:'pipe'});
});

test('recurring snoozes choose the earliest pending snooze or regular occurrence without duplicate rows',()=>{
 const {model}=domain();const clock=new Date(2027,1,28,12);
 const daily={id:'daily',title:'Daily',date:new Date(2027,1,1,16).toISOString(),notificationId:'keep',recurrence:'daily'};
 const result=until=>model.selectTodayWidget([{...daily,snoozedUntil:until.toISOString()}],[],clock).rows;
 assert.equal(result(new Date(2027,1,28,13))[0].time,new Date(2027,1,28,13).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}));
 assert.equal(result(new Date(2027,1,28,17))[0].time,model.selectTodayWidget([daily],[],clock).rows[0].time);
 assert.equal(result(new Date(2027,2,1,13))[0].time,model.selectTodayWidget([daily],[],clock).rows[0].time);
 assert.equal(result(new Date(2027,1,28,13)).length,1);
 const futureOnce={...daily,recurrence:'once',date:new Date(2027,1,28,16).toISOString(),snoozedUntil:new Date(2027,1,28,13).toISOString()};
 assert.equal(model.selectTodayWidget([futureOnce],[],clock).rows[0].time,model.selectTodayWidget([daily],[],clock).rows[0].time);
 const weekly={...daily,id:'weekly',recurrence:'selectedDays',weekdays:[new Date(2027,1,27).getDay()],snoozedUntil:new Date(2027,1,28,13).toISOString()};
 assert.equal(model.selectTodayWidget([weekly],[],clock).rows[0].id,'weekly');
 assert.equal(model.selectTodayWidget([{...weekly,completedThrough:new Date(2027,1,27,16).toISOString()}],[],clock).rows.length,0);
});
