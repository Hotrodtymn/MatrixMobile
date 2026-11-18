import React, { useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { TaskButton } from './tasks/TaskButton';
import { taskStyles, taskTheme } from './tasks/taskTheme';
import { ReminderList, ReminderPriority, REMINDER_PRIORITIES } from '../services/reminderMetadata';
import { createReminderList, renameReminderList, deleteReminderList, Reminder } from '../services/reminders';

export function PrioritySelector({value,onChange,light,filter=false}: {value:string;onChange:(value:string)=>void;light:boolean;filter?:boolean}) {
  const theme=taskTheme(light);
  return <View><Text style={[taskStyles.label,{color:theme.text}]}>PRIORITY{filter ? ' FILTER' : ''}</Text><View style={taskStyles.row}>
    {(filter ? ['all',...REMINDER_PRIORITIES] : REMINDER_PRIORITIES).map(priority=><TaskButton key={priority} label={priority[0].toUpperCase()+priority.slice(1)} theme={theme} selected={value===priority} onPress={()=>onChange(priority)} accessibilityLabel={`${filter ? 'Filter' : 'Set'} priority ${priority}`} />)}
  </View></View>;
}
export function ReminderMetadataFields({lists,listId,priority,onList,onPriority,light}: {lists:ReminderList[];listId?:string;priority:ReminderPriority;onList:(id?:string)=>void;onPriority:(value:ReminderPriority)=>void;light:boolean}) {
  const theme=taskTheme(light);
  return <View style={{gap:10}}><Text style={[taskStyles.label,{color:theme.text}]}>REMINDER LIST</Text><View style={taskStyles.row}>
    <TaskButton label="Unassigned" theme={theme} selected={!listId} onPress={()=>onList(undefined)} />
    {lists.map(list=><TaskButton key={list.id} label={list.name} theme={theme} selected={listId===list.id} onPress={()=>onList(list.id)} />)}
    {!!listId && !lists.some(list=>list.id===listId) && <Text style={{color:theme.error}}>This list is unavailable. Choose Unassigned.</Text>}
  </View><PrioritySelector light={light} value={priority} onChange={value=>onPriority(value as ReminderPriority)} /></View>;
}
function ListRow({list,light,busy,onRename,onDelete}: {list:ReminderList;light:boolean;busy:boolean;onRename:(name:string)=>void;onDelete:()=>void}) {
 const [name,setName]=useState(list.name); const theme=taskTheme(light);
 return <View style={{gap:8,marginVertical:8}}><TextInput accessibilityLabel={`Rename list ${list.name}`} value={name} onChangeText={setName} maxLength={60} editable={!busy} style={[taskStyles.input,{color:theme.text,borderColor:theme.border,backgroundColor:theme.surface}]} /><View style={taskStyles.row}>
  <TaskButton label="Rename" theme={theme} disabled={busy} onPress={()=>onRename(name)} />
  <TaskButton label="Delete list" theme={theme} danger disabled={busy} onPress={()=>Alert.alert('Delete list?',`Keep all reminders from ${list.name} and make them Unassigned?`,[{text:'Cancel',style:'cancel'},{text:'Delete list',style:'destructive',onPress:onDelete}])} />
 </View></View>;
}
export function ReminderListManager({lists,light,onChanged}: {lists:ReminderList[];light:boolean;onChanged:(records?:Reminder[])=>Promise<void>}) {
 const [open,setOpen]=useState(false);const [name,setName]=useState('');const [busy,setBusy]=useState(false);const running=useRef(false);const theme=taskTheme(light);
 async function perform(work:()=>Promise<void>) {if(running.current)return;running.current=true;setBusy(true);try{await work();}catch(error){Alert.alert('Could not update lists',error instanceof Error?error.message:'Please retry.');}finally{running.current=false;setBusy(false);}}
 return <View style={{gap:8}}><TaskButton label={open?'Close list manager':'Manage reminder lists'} theme={theme} onPress={()=>setOpen(!open)} />{open&&<>
  <Text style={{color:theme.muted}}>Deleting a list keeps its reminders and alerts.</Text>
  <TextInput accessibilityLabel="New reminder list name" placeholder="New list name" placeholderTextColor={theme.muted} value={name} onChangeText={setName} maxLength={60} editable={!busy} style={[taskStyles.input,{color:theme.text,borderColor:theme.border,backgroundColor:theme.surface}]} />
  <TaskButton label="Create list" theme={theme} disabled={busy} onPress={()=>void perform(async()=>{await createReminderList(name);setName('');await onChanged();})} />
  {lists.map(list=><ListRow key={list.id} list={list} light={light} busy={busy} onRename={name=>void perform(async()=>{await renameReminderList(list.id,name);await onChanged();})} onDelete={()=>void perform(async()=>{const result=await deleteReminderList(list.id);await onChanged(result.records);if(result.cleanupFailed)Alert.alert('List deleted','Reminders are Unassigned. Some stored references could not be cleared; saved reminders and alerts were retained.');})} />)}
  {!lists.length&&<Text style={{color:theme.muted}}>No lists yet. Reminders can stay Unassigned.</Text>}
 </>}</View>;
}
