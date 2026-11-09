import {useEffect,useRef,useState} from 'react';
import {api} from './api';
import {CopyEditor} from './CopyEditor';
import {allowNavigation} from '../navigation';
export type Copy = { edit_revision?:number; storage_location?:string|null; notes?:string|null; id: number; edition_id: number; title: string; manufacturer: string | null; piece_count: number | null; release_year: number | null; sku: string | null; image_url: string; studio_image_url?:string|null;corrected_image_url?:string|null;original_image_url?:string|null;original_download_url?:string|null;uses_studio?:boolean;studio_background?:string;default_view?:'studio'|'corrected'|'original';visibility: string; box_condition: string | null; seal_status: string | null; completeness: string | null; provenance: { suggestion: { catalogue_verified: boolean } } };
export function PrivateCopyDetails({copy,onBack,onUpdated,backLabel='Collection'}:{copy:Copy;onBack:()=>void;onUpdated?:(copy:Copy)=>void;backLabel?:string}) {
  const [selected,setSelected]=useState(copy);const [editing,setEditing]=useState(false);const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');const editButton=useRef<HTMLButtonElement>(null);const wasEditing=useRef(false);const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(editing)wasEditing.current=true;else if(wasEditing.current){editButton.current?.focus();wasEditing.current=false;}},[editing]);
  async function edit() {
    if(loading)return;setLoading(true);setError('');setNotice('');
    try {const result=await api<{copy:Copy}>(`/collection-copies/${copy.id}`);if(alive.current){setSelected(result.copy);setEditing(true);}}
    catch(reason){if(alive.current)setError(reason instanceof Error?reason.message:'Could not open editing. Retry.');}
    finally{if(alive.current)setLoading(false);}
  }
  function updated(value:Copy) {setSelected(value);setEditing(false);setNotice('Changes saved.');onUpdated?.(value);}
  const [view,setView]=useState<'studio'|'corrected'|'original'>(copy.default_view??'original');
  return (<section className="import-detail"><button className="back-button" onClick={()=>{if(allowNavigation())onBack();}}>← {backLabel}</button>
      <div className="import-actions" role="group" aria-label="Photograph view">{([['studio','Studio',selected.studio_image_url],['corrected','Corrected Front',selected.corrected_image_url],['original','Original',selected.original_image_url]] as const).map(([key,label,url])=><button key={key} disabled={!url} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</div>
      <img className={view==='studio'?'studio-surface':undefined} data-background={selected.studio_background} src={(view==='studio'?selected.studio_image_url:view==='corrected'?selected.corrected_image_url:selected.original_image_url)??selected.image_url} alt={`${view==='studio'?'Studio presentation':view==='corrected'?'Corrected front':'Original photograph'} of ${selected.title}`} />
      {view==='studio'&&<p>Sides and shadows are simulated; the front uses your corrected photograph.</p>}
      {selected.original_download_url&&<a href={selected.original_download_url}>Download untouched original</a>}
      {error&&<p role="alert" className="import-error">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
      {!editing&&<div className="import-actions"><button ref={editButton} disabled={loading} onClick={()=>void edit()}>{loading?'Opening editor…':'Edit'}</button></div>}
      {editing&&<CopyEditor copy={selected} onSaved={updated} onCancel={latest=>{if(latest){setSelected(latest);onUpdated?.(latest);}setEditing(false);}}/>}
      <h1 className="private-detail-title">{selected.title}</h1><p>{selected.manufacturer ?? 'Unknown manufacturer'} · {selected.piece_count ?? 'Unknown'} pieces</p><dl>{[['Product number',selected.sku],['Release year',selected.release_year],['Condition',selected.box_condition],['Seal',selected.seal_status],['Completeness',selected.completeness],['Storage location',selected.storage_location]].map(([label,value]) => <div key={String(label)}><dt>{label}</dt><dd>{value ?? 'Unknown'}</dd></div>)}</dl>{selected.notes&&<section aria-label="Personal notes"><h2>Notes</h2><p className="copy-notes">{selected.notes}</p></section>}<p>Private copy #{selected.id} · Edition #{selected.edition_id}. Human reviewed; not automatically catalogue verified.</p></section>
  );
}
