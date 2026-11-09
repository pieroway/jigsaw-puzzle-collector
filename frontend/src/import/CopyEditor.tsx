import {useEffect,useRef,useState,type FormEvent} from 'react';
import {api} from './api';
import type {Copy} from './PrivateCopyDetails';
import './CopyEditor.css';
const labels={title:'Title',manufacturer:'Manufacturer',piece_count:'Piece count',sku:'Product number',release_year:'Release year',box_condition:'Box condition',seal_status:'Seal status',completeness:'Completeness',storage_location:'Storage location',notes:'Notes'};
type Field=keyof typeof labels;
type Draft=Record<Field,string>;
const keys=Object.keys(labels) as Field[];
const limits:Partial<Record<Field,number>>={title:255,manufacturer:160,sku:100,notes:5000,storage_location:255};
const choices:Partial<Record<Field,[string,string][]>>={box_condition:[['new','New'],['excellent','Excellent'],['good','Good'],['fair','Fair'],['poor','Poor']],seal_status:[['sealed','Sealed'],['opened','Opened']],completeness:[['complete','Complete'],['incomplete','Incomplete'],['unchecked','Not checked']]};
function toDraft(copy:Copy):Draft {return Object.fromEntries(keys.map(key=>[key,String(copy[key]??'')])) as Draft;}
export function CopyEditor({copy,onSaved,onCancel}:{copy:Copy;onSaved:(copy:Copy)=>void;onCancel:(latest?:Copy)=>void}) {
  const [base,setBase]=useState(copy);const [draft,setDraft]=useState(()=>toDraft(copy));const [busy,setBusy]=useState(false);
  const [errors,setErrors]=useState<Record<string,string>>({});const [error,setError]=useState('');const [conflict,setConflict]=useState(false);
  const saving=useRef(false);const alive=useRef(true);
  const baseline=toDraft(base);const changed=keys.filter(key=>draft[key].trim()!==baseline[key].trim());const dirty=changed.length>0;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    const beforeNavigate=(event:Event)=>{if(saving.current||(dirty&&!window.confirm('Discard unsaved changes to this copy?')))event.preventDefault();};
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(dirty||saving.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('jigsaw:before-navigate',beforeNavigate);window.addEventListener('beforeunload',beforeUnload);
    return()=>{window.removeEventListener('jigsaw:before-navigate',beforeNavigate);window.removeEventListener('beforeunload',beforeUnload);};
  },[dirty]);
  function change(key:Field,value:string){setDraft(old=>({...old,[key]:value}));setErrors(old=>{const next={...old};delete next[key];return next;});}
  async function save(event:FormEvent) {
    event.preventDefault();if(saving.current||!dirty||conflict)return;
    const fields:Record<string,string|number|null>={};const invalid:Record<string,string>={};
    for(const key of changed) {
      const text=draft[key].trim();fields[key]=text===''?null:key==='piece_count'||key==='release_year'?Number(text):text;
      if(key==='title'&&!text)invalid[key]='Enter a title.';
      const max=limits[key]??50;
      if(text.length>max)invalid[key]=`Use at most ${max} characters.`;
      if((key==='piece_count'||key==='release_year')&&text) {const [min,limit]=key==='piece_count'?[1,100000]:[1800,2100];if(!Number.isInteger(Number(text))||Number(text)<min||Number(text)>limit)invalid[key]=`Enter a whole number between ${min} and ${limit}, or leave blank for unknown.`;}
    }
    setErrors(invalid);if(Object.keys(invalid).length)return;
    saving.current=true;setBusy(true);setError('');
    try {const result=await api<{copy:Copy}>(`/collection-copies/${base.id}`,'PATCH',{revision:base.edit_revision,fields});if(alive.current)onSaved(result.copy);}
    catch(reason) {if(alive.current){const failure=reason as Error&{status?:number;fields?:Record<string,string>};setError(failure.message||'Changes could not be saved. Please retry.');setErrors(failure.fields??{});setConflict(failure.status===409);}}
    finally {saving.current=false;if(alive.current)setBusy(false);}
  }
  async function reload() {
    if(saving.current||(dirty&&!window.confirm('Discard your draft and load the latest saved values?')))return;
    saving.current=true;setBusy(true);
    try {const result=await api<{copy:Copy}>(`/collection-copies/${base.id}`);if(alive.current){setBase(result.copy);setDraft(toDraft(result.copy));setConflict(false);setError('');setErrors({});}}
    catch(reason){if(alive.current)setError(reason instanceof Error?reason.message:'Could not load the latest copy. Retry.');}
    finally{saving.current=false;if(alive.current)setBusy(false);}
  }
  function input(key:Field) {
    const attributes={id:`copy-${base.id}-${key}`,disabled:busy,'aria-invalid':!!errors[key],'aria-describedby':errors[key]?`copy-error-${key}`:undefined};
    const options=choices[key];const legacy=baseline[key]&&options&&!options.some(([value])=>value===baseline[key]);
    return <label key={key} htmlFor={attributes.id}>{labels[key]}{options?<select {...attributes} value={draft[key]} onChange={event=>change(key,event.target.value)}><option value="">Unknown</option>{legacy&&<option value={baseline[key]}>{baseline[key]} (saved value)</option>}{options.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>:key==='notes'?<textarea {...attributes} rows={5} maxLength={5000} value={draft[key]} onChange={event=>change(key,event.target.value)}/>:<input {...attributes} autoFocus={key==='title'} type={key==='piece_count'||key==='release_year'?'number':'text'} step="1" min={key==='piece_count'?1:key==='release_year'?1800:undefined} max={key==='piece_count'?100000:key==='release_year'?2100:undefined} value={draft[key]} onChange={event=>change(key,event.target.value)}/>}{errors[key]&&<span className="copy-field-error" id={`copy-error-${key}`}>{errors[key]}</span>}</label>;
  }
  return <form className="copy-editor" aria-label="Edit your copy" noValidate onSubmit={event=>void save(event)}>
    <h2>Edit your copy</h2><p>Corrections apply only to this physical copy. Your original import and photographs are preserved.</p>
    {error&&<p role="alert" className="import-error">{error} {conflict&&'Your changes are still here; load the latest saved values to continue.'}</p>}
    <fieldset disabled={busy}><legend>Puzzle information</legend><div className="copy-edit-grid">{(['title','manufacturer','piece_count','sku','release_year'] as Field[]).map(input)}</div></fieldset>
    <fieldset disabled={busy}><legend>My physical copy</legend><div className="copy-edit-grid">{(['box_condition','seal_status','completeness','storage_location','notes'] as Field[]).map(input)}</div></fieldset>
    <div className="import-actions"><button type="submit" className="primary-action" disabled={busy||!dirty||conflict}>{busy?'Saving…':'Save changes'}</button><button type="button" disabled={busy} onClick={()=>onCancel(base)}>Cancel</button>{conflict&&<button type="button" disabled={busy} onClick={()=>void reload()}>Load latest saved values</button>}</div>
    {dirty&&!busy&&<p role="status">You have unsaved changes.</p>}
  </form>;
}
