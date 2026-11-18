const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function load(file,requireModule) {
 const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,require:requireModule});return exports;
}
test('static compatibility widget only renders its own add/update/resize events',async()=>{
 const react={createElement:(type,props,...children)=>({type,props,children})};
 const api=load('src/widgets/MatrixCompatibilityWidget.tsx',name=>name==='react'?{default:react,__esModule:true}:{FlexWidget:'FlexWidget',TextWidget:'TextWidget'});
 const renders=[];
 for(const event of ['WIDGET_ADDED','WIDGET_UPDATE','WIDGET_RESIZED','WIDGET_DELETED','WIDGET_CLICK'])await api.compatibilityWidgetTaskHandler({widgetInfo:{widgetName:'MatrixCompatibility'},widgetAction:event,renderWidget:value=>renders.push(value)});
 await api.compatibilityWidgetTaskHandler({widgetInfo:{widgetName:'Other'},widgetAction:'WIDGET_ADDED',renderWidget:value=>renders.push(value)});
 assert.equal(renders.length,3);assert.ok(renders.every(item=>item.type===api.MatrixCompatibilityWidget));
 const layout=api.MatrixCompatibilityWidget();assert.equal(layout.children[0].props.text,'Matrix compatibility test');
});
test('registration is isolated to Android and the other-platform entry never imports native code',()=>{
 const neutral=load('src/widgets/registerWidget.ts',()=>{throw Error('native import on non-Android');});neutral.registerCompatibilityWidget();
 let registered;const handler=()=>{};
 const android=load('src/widgets/registerWidget.android.ts',name=>name==='react-native-android-widget'?{registerWidgetTaskHandler:value=>{registered=value;}}:{compatibilityWidgetTaskHandler:handler});
 android.registerCompatibilityWidget();assert.equal(registered,handler);
});
