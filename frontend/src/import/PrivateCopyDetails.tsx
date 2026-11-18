import {useCoverSettings,resolveCover,rememberCoverView} from './coverPreference';
import {responsivePhoto} from './imageDelivery';
import {BoxPhotos} from './BoxPhotos';
import {useEffect,useRef,useState} from 'react';
import {api} from './api';
import {CopyEditor} from './CopyEditor';
import {allowNavigation} from '../navigation';
import {DeleteCopyButton} from './DeleteCopyButton';
import type {CopyRemoval} from './CopyRemovalNotice';
import {collectionDate} from './collectionDate';
import {SavedChangesNotice} from './SavedChangesNotice';
export type Copy = { user_id?:number; created_at?:string|null; edit_revision?:number; storage_location?:string|null; notes?:string|null; id: number; edition_id: number; title: string; manufacturer: string | null; piece_count: number | null; release_year: number | null; sku: string | null; image_url: string; studio_image_url?:string|null;corrected_image_url?:string|null;original_image_url?:string|null;original_download_url?:string|null;uses_studio?:boolean;studio_background?:string;default_view?:'studio'|'corrected'|'original';visibility: string; box_condition: string | null; seal_status: string | null; completeness: string | null; provenance: { suggestion: { catalogue_verified: boolean } } };
export function PrivateCopyDetails({copy,onBack,onUpdated,onRemoved,backLabel='Collection'}:{copy:Copy;onBack:()=>void;onUpdated?:(copy:Copy)=>void;onRemoved?:(result:CopyRemoval)=>void;backLabel?:string}) {
  const coverSettings=useCoverSettings();
  const [selected,setSelected]=useState(copy);const [editing,setEditing]=useState(false);const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');const editButton=useRef<HTMLButtonElement>(null);const wasEditing=useRef(false);const alive=useRef(true);
  const [unavailable,setUnavailable]=useState(false);const missingBack=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(unavailable)missingBack.current?.focus();},[unavailable]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(editing)wasEditing.current=true;else if(wasEditing.current){editButton.current?.focus();wasEditing.current=false;}},[editing]);
  async function edit() {
    if(loading)return;setLoading(true);setError('');setNotice('');
    try {const result=await api<{copy:Copy}>(`/collection-copies/${copy.id}`);if(alive.current){setSelected(result.copy);setEditing(true);}}
    catch(reason){if(alive.current){if((reason as {status?:number}).status===404)setUnavailable(true);else setError(reason instanceof Error?reason.message:'Could not open editing. Retry.');}}
    finally{if(alive.current)setLoading(false);}
  }
  function updated(value:Copy) {setSelected(value);setEditing(false);setNotice('Changes saved.');onUpdated?.(value);}
  function missing() {if(onRemoved)onRemoved({copy_id:copy.id,missing:true});else onBack();}
  const [view,setView]=useState<'studio'|'corrected'|'original'>(()=>resolveCover(copy,coverSettings).view);
  const added=collectionDate(selected.created_at);
  if(unavailable)return <section className="import-detail"><p role="status">This copy is no longer available in your collection. It may have been deleted on another device.</p><button ref={missingBack} className="back-button" onClick={missing}>Return to {backLabel}</button></section>;
  return (<section className="import-detail"><button className="back-button" onClick={()=>{if(allowNavigation())onBack();}}>← {backLabel}</button>
      <BoxPhotos key={selected.id} copyId={selected.id} title={selected.title} coverUrl={(view==='studio'?selected.studio_image_url:view==='corrected'?selected.corrected_image_url:selected.original_image_url)??selected.image_url} toolbar={showCover=><div className="import-actions" role="group" aria-label="Photograph view">{([['studio','Studio',selected.studio_image_url],['corrected','Corrected Front',selected.corrected_image_url],['original','Original',selected.original_image_url]] as const).map(([key,label,url])=><button key={key} disabled={!url} aria-pressed={view===key} onClick={()=>{setView(key);rememberCoverView(selected,key);showCover();}}>{label}</button>)}</div>} caption="Sides and shadows are simulated; the front uses your corrected photograph." showCaption={view==='studio'}>
      <img key={view} className={view==='studio'?'studio-surface':undefined} data-background={selected.studio_background} {...responsivePhoto((view==='studio'?selected.studio_image_url:view==='corrected'?selected.corrected_image_url:selected.original_image_url)??selected.image_url)} alt={`${view==='studio'?'Studio presentation':view==='corrected'?'Corrected front':'Original photograph'} of ${selected.title}`} />
      </BoxPhotos>
      {error&&<p role="alert" className="import-error">{error}</p>}
      {notice&&<SavedChangesNotice message={notice}/>}
      <h1 className="private-detail-title">{selected.title}</h1><p>{selected.manufacturer ?? 'Unknown manufacturer'} · {selected.piece_count ?? 'Unknown'} pieces</p><dl><div><dt>Added to collection</dt><dd>{added?<time dateTime={added.toISOString()}>{added.toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'})}</time>:'Unknown'}</dd></div>{[['Product number',selected.sku],['Release year',selected.release_year],['Condition',selected.box_condition],['Seal',selected.seal_status],['Completeness',selected.completeness],['Storage location',selected.storage_location]].map(([label,value]) => <div key={String(label)}><dt>{label}</dt><dd>{value ?? 'Unknown'}</dd></div>)}</dl>{selected.notes&&<section aria-label="Personal notes"><h2>Notes</h2><p className="copy-notes">{selected.notes}</p></section>}{!editing&&<div className="import-actions copy-detail-edit-action"><button ref={editButton} disabled={loading} onClick={()=>void edit()}>{loading?'Opening editor…':'Edit'}</button></div>}
      {editing&&<CopyEditor backLabel={backLabel} copy={selected} onSaved={updated} onMissing={missing} onCancel={latest=>{if(latest){setSelected(latest);onUpdated?.(latest);}setEditing(false);}}/>}<p>Private copy #{selected.id} · Edition #{selected.edition_id}. Human reviewed; not automatically catalogue verified.</p>{!editing&&onRemoved&&<DeleteCopyButton copy={selected} disabled={loading} onReviewed={value=>{setSelected(value);onUpdated?.(value);}} onRemoved={onRemoved} onUnavailable={()=>setUnavailable(true)}/>}</section>
  );
}
