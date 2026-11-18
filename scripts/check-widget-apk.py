import struct,zipfile,json,sys
u16=lambda b,o:struct.unpack_from('<H',b,o)[0]
u32=lambda b,o:struct.unpack_from('<I',b,o)[0]
def chunks(b,start,end):
 while start<end:
  t,h,n=struct.unpack_from('<HHI',b,start);assert n>=h and start+n<=end
  yield start,t,h,n
  start+=n
def pool(b,p):
 h=u16(b,p+2);count=u32(b,p+8);flags=u32(b,p+16);base=p+u32(b,p+20);out=[]
 for i in range(count):
  o=base+u32(b,p+h+4*i)
  if flags&256:
   def length(o):
    n=b[o];return (((n&127)<<8)|b[o+1],o+2) if n&128 else (n,o+1)
   _,o=length(o);n,o=length(o);out.append(b[o:o+n].decode('utf8'))
  else:
   n=u16(b,o);o+=2
   if n&32768:n=((n&32767)<<16)|u16(b,o);o+=2
   out.append(b[o:o+n*2].decode('utf-16le'))
 return out
import xml.etree.ElementTree as ET

def xml(b):
 strings=[];root=None;stack=[]
 for p,t,h,n in chunks(b,u16(b,2),len(b)):
  if t==1:strings=pool(b,p)
  elif t==0x102:
   tag=strings[u32(b,p+20)];node=ET.Element(tag);start=p+16+u16(b,p+24);stride=u16(b,p+26)
   for i in range(u16(b,p+28)):
    a=start+i*stride;name=strings[u32(b,a+4)];raw=u32(b,a+8);typ=b[a+15];v=u32(b,a+16)
    if raw!=0xffffffff:value=strings[raw]
    elif typ==3:value=strings[v]
    elif typ==1:value=f'@0x{v:08x}'
    elif typ==18:value='true' if v else 'false'
    elif typ==5:
     mantissa=v&0xffffff00
     if mantissa&0x80000000:mantissa-=0x100000000
     value=str(mantissa*[1/256,1/32768,1/8388608,1/2147483648][(v>>4)&3])+['px','dp','sp','pt','in','mm'][v&15]
    else:value=str(v)
    node.set(name,value)
   if stack:stack[-1].append(node)
   else:root=node
   stack.append(node)
  elif t==0x103:stack.pop()
 return root

def resources(b):
 result={};strings=[]
 for p,t,h,n in chunks(b,u16(b,2),len(b)):
  if t==1:strings=pool(b,p)
  if t!=0x200:continue
  pkg=u32(b,p+8);types=pool(b,p+u32(b,p+268));keys=pool(b,p+u32(b,p+276))
  for q,typ,hh,nn in chunks(b,p+h,p+n):
   if typ!=0x201:continue
   tid=b[q+8];flags=b[q+9];count=u32(b,q+12);es=q+u32(b,q+16)
   if flags&1:
    offsets=[(u16(b,q+hh+4*i),u16(b,q+hh+4*i+2)*4) for i in range(count)]
   elif flags&2:offsets=[(i,u16(b,q+hh+2*i)*4) for i in range(count) if u16(b,q+hh+2*i)!=0xffff]
   else:offsets=[(i,u32(b,q+hh+4*i)) for i in range(count) if u32(b,q+hh+4*i)!=0xffffffff]
   for i,off in offsets:
    e=es+off;rid=(pkg<<24)|(tid<<16)|i
    if u16(b,e+2)&1:continue
    v=e+u16(b,e);kind=b[v+3];value=u32(b,v+4)
    result.setdefault(rid,[]).append({'name':types[tid-1]+'/'+keys[u32(b,e+4)],'type':kind,'value':strings[value] if kind==3 else value})
 return result


# This checker reads final APKs; it does not generate native projects or install apps.
import argparse
import hashlib
from pathlib import Path


def dex_classes(archive):
 result=set()
 for name in archive.namelist():
  if not name.endswith('.dex'):continue
  d=archive.read(name)
  if not d.startswith(b'dex\n'):raise ValueError('Invalid DEX header')
  _,so,_,to=struct.unpack_from('<4I',d,0x38);count,co=struct.unpack_from('<2I',d,0x60)
  for i in range(count):
   ci=u32(d,co+i*32);si=u32(d,to+ci*4);off=u32(d,so+si*4)
   while d[off]&128:off+=1
   off+=1
   result.add(d[off:d.index(b'\0',off)].decode('utf8',errors='replace'))
 return result


def validate(root, table, load_xml, classes, *, version_code, channel,
             expect_widget, package='com.hotrodtymn.matrix', runtime='1.5.0'):
 def require(ok,message):
  if not ok:raise ValueError(message)
 def values(ref):
  require(isinstance(ref,str) and ref.startswith('@0x'),'Missing resource reference')
  rows=table.get(int(ref[1:],16),[])
  require(bool(rows),'Unresolved resource '+ref)
  require(all(x['type']==3 for x in rows),'Expected string/file resource')
  return [x['value'] for x in rows]
 require(root.tag=='manifest','Invalid manifest root')
 require(root.get('package')==package,'Wrong Android package')
 require(root.get('versionCode')==str(version_code),'Wrong versionCode')
 require(root.get('versionName')==runtime,'Wrong versionName')
 app=root.find('application');require(app is not None,'Missing application')
 require(app.get('enabled','true')!='false','Application disabled')
 meta={x.get('name'):x for x in app.findall('meta-data')}
 rv=meta.get('expo.modules.updates.EXPO_RUNTIME_VERSION')
 require(rv is not None,'Missing runtime metadata')
 ref=rv.get('value');runtime_values=values(ref) if ref and ref.startswith('@') else [ref]
 require(set(runtime_values)=={runtime},'Wrong runtime')
 headers=meta.get('expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY')
 require(headers is not None,'Missing channel metadata')
 require(json.loads(headers.get('value','{}')).get('expo-channel-name')==channel,'Wrong channel')
 providers=[]
 for receiver in app.findall('receiver'):
  actions={a.get('name') for a in receiver.findall('./intent-filter/action')}
  metadata=receiver.find("meta-data[@name='android.appwidget.provider']")
  if metadata is not None or 'android.appwidget.action.APPWIDGET_UPDATE' in actions:
   providers.append((receiver,actions,metadata))
 widget_classes={x for x in classes if x.startswith('Lcom/reactnativeandroidwidget/') or x==f'L{package.replace(chr(46),chr(47))}/widget/MatrixCompatibility;'}
 widget_resources=[row['name'] for rows in table.values() for row in rows if row['name'].startswith('xml/widgetprovider_')]
 if expect_widget=='absent':
  require(not providers,'Recovery contains widget receiver/metadata')
  require(not widget_classes,'Recovery contains native widget classes')
  require(not widget_resources,'Recovery contains widget provider XML')
  return {'widget':'absent','providerCount':0}
 require(len(providers)==1,'Expected exactly one widget provider')
 receiver,actions,metadata=providers[0]
 require(receiver.get('name')==package+'.widget.MatrixCompatibility','Wrong widget receiver')
 require(receiver.get('enabled','true')!='false','Widget receiver disabled')
 require(receiver.get('label')=='Matrix Compatibility','Wrong widget label')
 require('android.appwidget.action.APPWIDGET_UPDATE' in actions,'Missing APPWIDGET_UPDATE action')
 require(metadata is not None,'Missing android.appwidget.provider metadata')
 paths=values(metadata.get('resource'));require(bool(paths),'Missing provider XML')
 for path in paths:
  provider=load_xml(path);require(provider.tag=='appwidget-provider','Invalid provider XML root')
  for key,expected in [('minWidth','180.0dp'),('minHeight','80.0dp'),('targetCellWidth','2'),('targetCellHeight','1'),('resizeMode','3'),('updatePeriodMillis','0')]:
   require(provider.get(key)==expected,'Wrong widget '+key)
  require(int(provider.get('widgetCategory','0'))&1,'Widget not available on home screen')
  require(not provider.get('configure'),'Unexpected configuration activity')
  for layout in values(provider.get('initialLayout')):
   require(load_xml(layout).tag=='FrameLayout','Invalid initial layout')
  require(all(values(provider.get('description'))),'Missing widget description')
 require(f'L{package.replace(chr(46),chr(47))}/widget/MatrixCompatibility;' in classes,'Missing compiled provider class')
 require('Lcom/reactnativeandroidwidget/RNWidgetProvider;' in classes,'Missing widget engine')
 return {'widget':'present','provider':receiver.get('name'),'providerXml':paths,
         'label':receiver.get('label'),'enabled':True,'exported':receiver.get('exported'),
         'dimensions':'180x80dp / 2x1 cells'}


def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('apk',type=Path)
 parser.add_argument('--expect-widget',choices=['present','absent'],required=True)
 parser.add_argument('--version-code',type=int,required=True)
 parser.add_argument('--channel',required=True)
 parser.add_argument('--runtime',default='1.5.0')
 parser.add_argument('--package',default='com.hotrodtymn.matrix')
 args=parser.parse_args()
 with zipfile.ZipFile(args.apk) as archive:
  result=validate(xml(archive.read('AndroidManifest.xml')),resources(archive.read('resources.arsc')),
     lambda path:xml(archive.read(path)),dex_classes(archive),version_code=args.version_code,
     channel=args.channel,expect_widget=args.expect_widget,package=args.package,runtime=args.runtime)
 result.update(package=args.package,versionCode=args.version_code,runtime=args.runtime,
               channel=args.channel,apk=str(args.apk),sha256=hashlib.sha256(args.apk.read_bytes()).hexdigest())
 print(json.dumps(result,indent=2))


if __name__=='__main__':
 try:main()
 except (ValueError,AssertionError,KeyError,struct.error) as error:
  raise SystemExit('APK CHECK FAILED: '+str(error))
