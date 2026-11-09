import {useEffect,useRef,useState} from 'react';
import {api} from './api';
import type {Copy} from './PrivateCopyDetails';
import type {CopyRemoval} from './CopyRemovalNotice';
import './CopyDeletion.css';
export function DeleteCopyButton({copy,disabled,onRemoved,onUnavailable,onReviewed}:{copy:Copy;disabled:boolean;onRemoved:(result:CopyRemoval)=>void;onUnavailable:()=>void;onReviewed?:(copy:Copy)=>void}) {
  const [candidate,setCandidate]=useState<Copy|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [conflict,setConflict]=useState(false);
  const working=useRef(false);const deleting=useRef(false);const alive=useRef(true);const trigger=useRef<HTMLButtonElement>(null);const keep=useRef<HTMLButtonElement>(null);
  const restoreTrigger=useRef(false);
  function cancel(){restoreTrigger.current=true;setCandidate(null);setError('');setConflict(false);}
  useEffect(()=>{alive.current=true;const protect=(event:Event)=>{if(deleting.current)event.preventDefault();};const closing=(event:BeforeUnloadEvent)=>{if(deleting.current){event.preventDefault();event.returnValue='';}};window.addEventListener('jigsaw:before-navigate',protect);window.addEventListener('beforeunload',closing);return()=>{alive.current=false;window.removeEventListener('jigsaw:before-navigate',protect);window.removeEventListener('beforeunload',closing);};},[]);
  useEffect(()=>{
    if(candidate)keep.current?.focus();
    else if(restoreTrigger.current){restoreTrigger.current=false;trigger.current?.focus();}
    const escape=(event:KeyboardEvent)=>{if(candidate&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(!working.current)cancel();}};
    window.addEventListener('keydown',escape,true);return()=>window.removeEventListener('keydown',escape,true);
  },[candidate]);
  function failure(reason:unknown) {
    const failed=reason as Error&{status?:number};
    if(failed.status===404){onUnavailable();return;}
    setError(failed.message||'Could not delete this copy. Retry.');if(failed.status===409)setConflict(true);
  }
  async function review() {
    if(disabled||working.current)return;working.current=true;setBusy(true);setError('');
    try {const result=await api<{copy:Copy}>(`/collection-copies/${copy.id}`);if(alive.current){setCandidate(result.copy);setConflict(false);onReviewed?.(result.copy);}}
    catch(reason){if(alive.current)failure(reason);}
    finally{working.current=false;if(alive.current)setBusy(false);}
  }
  async function remove() {
    if(disabled||working.current||!candidate||conflict)return;working.current=true;deleting.current=true;setBusy(true);setError('');
    try {const result=await api<CopyRemoval>(`/collection-copies/${candidate.id}`,'DELETE',{revision:candidate.edit_revision});if(alive.current)onRemoved(result);}
    catch(reason){if(alive.current)failure(reason);}
    finally{working.current=false;deleting.current=false;if(alive.current)setBusy(false);}
  }
  return <div className="copy-delete">
    <button ref={trigger} hidden={!!candidate} className="copy-danger" type="button" disabled={disabled||busy} onClick={()=>void review()}>{busy&&!candidate?'Checking copy…':'Delete this copy'}</button>
    {!candidate&&error&&<p role="alert" className="import-error">{error}</p>}
    {candidate&&<section className="copy-delete-confirm" role="alertdialog" aria-label={`Delete ${candidate.title}`} aria-describedby={`delete-copy-${candidate.id}`}>
      <h2>Delete “{candidate.title}”?</h2><p id={`delete-copy-${candidate.id}`}>Copy #{candidate.id}: this physical copy, its corrections, private notes and edit history will be permanently deleted. There is no Undo. Other copies and shared puzzle/edition records are kept. Photos still used by import history or other copies are kept; unused photos are queued for cleanup.</p>
      {error&&<p role="alert" className="import-error">{error}</p>}
      <div className="import-actions"><button className="copy-danger" type="button" disabled={disabled||busy||conflict} onClick={()=>void remove()}>{deleting.current?'Deleting…':'Delete copy permanently'}</button><button ref={keep} type="button" disabled={busy} onClick={cancel}>Keep copy</button>{conflict&&<button type="button" disabled={busy} onClick={()=>void review()}>Review latest copy</button>}</div>
    </section>}
  </div>;
}
