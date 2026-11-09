import { useEffect, useRef, useState } from 'react';
import { api, session, type Session } from './api';
import { toDraft, reviewPayload, type Batch, type ImportItem } from './model';
import './import.css';
import { ImageReview } from './ImageReview';
import {DeleteBatchButton} from './DeleteBatchButton';
import {PhotoFilePicker} from './PhotoFilePicker';

type Props = { onViewCollection: () => void; onSession: (signedIn: boolean) => void; initialBatchId?:number|null };
type Pending = { key: string; name: string; file?: File; state: 'uploading' | 'failed'; error?: string };
const retryKey = () => crypto.randomUUID?.() ?? `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function ImportWorkspace({ onViewCollection, onSession,initialBatchId }: Props) {
  const requestedBatch=useRef(initialBatchId);
  const [account, setAccount] = useState<Session | null>(null);
  const [batches, setBatches] = useState<{ id: number; created_at: string }[]>([]);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [cleanupPending,setCleanupPending]=useState(0);
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [imageDirty, setImageDirty] = useState<Set<number>>(new Set());
  const batchRef = useRef<Batch | null>(null);
  function show(value: Batch) { batchRef.current = value; setBatch(value); }
  async function load(id: number) { const value = await api<Batch>(`/import-batches/${id}`); if (batchRef.current?.id !== id) { setDirty(new Set()); setImageDirty(new Set()); } show(value); localStorage.setItem('jigsaw-import-batch', String(id)); return value; }
  async function list() {
    const result = await api<{ batches: { id: number; created_at: string }[];cleanup_pending?:number }>('/import-batches'); setBatches(result.batches);setCleanupPending(result.cleanup_pending??0);
    const saved = Number(localStorage.getItem('jigsaw-import-batch'));
    const id = requestedBatch.current ?? result.batches.find(x => x.id === saved)?.id ?? result.batches[0]?.id;
    requestedBatch.current=null;
    if (id) {
      const value=await load(id);
      if(!result.batches.some(batch=>batch.id===id))setBatches([{id:value.id,created_at:value.created_at},...result.batches]);
    }
    else {setBatch(null);batchRef.current=null;localStorage.removeItem('jigsaw-import-batch');}
  }
  useEffect(() => {
    let alive = true;
    void session().then(async value => { if (!alive) return; setAccount(value); onSession(!!value.user); if (value.user) await list(); }).catch(e => setError(String(e.message))).finally(() => setLoaded(true));
    return () => { alive = false; };
    // Initialize only when the workspace is mounted; user changes are handled below.
  }, []);
  async function task(work: () => Promise<void>) {
    if (busy) return false; setBusy(true); setError(''); setNotice('');
    try { await work();return true; } catch (e) { setError(e instanceof Error ? e.message : 'The operation failed. Please retry.');return false; } finally { setBusy(false); }
  }
  async function deleteBatch(id:number) {
    return task(async()=>{
      const result=await api<{retained_copies:number;cleanup_pending:number}>(`/import-batches/${id}`,'DELETE');
      localStorage.removeItem(`jigsaw-pending-${account?.user?.id}-${id}`);localStorage.removeItem('jigsaw-import-batch');
      setBatch(null);batchRef.current=null;setBatches(old=>old.filter(value=>value.id!==id));setPending([]);setDirty(new Set());setImageDirty(new Set());setCleanupPending(result.cleanup_pending);
      setNotice(`Batch deleted. ${result.retained_copies} imported ${result.retained_copies===1?'puzzle was':'puzzles were'} kept in your collection.`);
      await list();
    });
  }
  async function process(id: number) {
    let value = await load(id);
    while (value.summary.queued + value.summary.processing > 0) {
      value = await api<Batch>(`/import-batches/${id}/process`, 'POST'); show(value);
    }
  }
  async function upload(files: File[], retry?: Pending) {
    if (!batch || !files.length) return;
    const id = batch.id;
    await task(async () => {
      const entries = files.map((file, i) => ({ file, key: retry && i === 0 ? retry.key : retryKey(), name: file.name, state: 'uploading' as const }));
      const owner = account?.user?.id;
      const storageKey = `jigsaw-pending-${owner}-${id}`;
      const previous = JSON.parse(localStorage.getItem(storageKey) || '[]') as { key: string; name: string; size: number; modified: number }[];
      const used = new Set<string>();
      for (const entry of entries) {
        const saved = previous.find(x => !used.has(x.key) && x.name === entry.name && x.size === entry.file.size && x.modified === entry.file.lastModified);
        if (saved) { entry.key = saved.key; used.add(saved.key); }
      }
      if (batch.items.length + entries.filter(entry => !batch.items.some(item => item.client_key === entry.key)).length > 100) throw new Error('Choose at most 100 photos per batch. Start another batch for more.');
      localStorage.setItem(storageKey, JSON.stringify([...previous.filter(x => !entries.some(e => e.key === x.key)), ...entries.map(e => ({ key: e.key, name: e.name, size: e.file.size, modified: e.file.lastModified }))]));
      setPending(old => [...old.filter(p => !entries.some(e => e.key === p.key)), ...entries]);
      for (const entry of entries) {
        try {
          const form = new FormData(); form.set('client_key', entry.key); form.set('photo', entry.file);
          await api<ImportItem>(`/import-batches/${id}/photos`, 'POST', form);
          setPending(old => old.filter(x => x.key !== entry.key));
          await load(id);
        } catch (e) {
          setPending(old => old.map(x => x.key === entry.key ? { ...x, state: 'failed', error: e instanceof Error ? e.message : 'Upload failed' } : x));
        }
      }
      await process(id);
      const records = JSON.parse(localStorage.getItem(storageKey) || '[]') as { key: string }[];
      const savedKeys = new Set(batchRef.current?.items.map(x => x.client_key));
      if (records.every(x => savedKeys.has(x.key))) localStorage.removeItem(storageKey);
    });
  }
  async function refreshItem(item: ImportItem) {
    if (batchRef.current) show({ ...batchRef.current, items: batchRef.current.items.map(x => x.id === item.id ? item : x) });
    if (batchRef.current) await load(batchRef.current.id);
  }
  if (!loaded) return <p role="status">Opening your photo workspace…</p>;
  return <div className="import-workspace">
    <div className="eyebrow">A HOME FOR EVERY BOX</div><h1>Photo import<span className="title-dot">.</span></h1>
    <p>Bring your collection in, one photo at a time.</p>
    {error && <p className="import-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!account?.user ? <p>Log in using the main header before adding puzzles.</p> : <>
      <div className="import-account"><span>{account.user.email}</span></div>
      <div className="import-notice"><strong>Offline fixture identification · no AI service</strong><p>Only the ten supplied reference photos have fixture suggestions. Other images start with unknown fields for you to fill in. Nothing is sent to a third party or published to a public catalogue.</p></div>
      <div className="import-actions"><button className="primary-action" disabled={busy} onClick={() => void task(async () => { const value = await api<{ id: number }>('/import-batches', 'POST', { client_key: retryKey() }); await list(); await load(value.id); setPending([]); })}>New photo batch</button><button disabled={busy} onClick={onViewCollection}>View private collection</button></div>
      {!!batches.length && <label>Resume batch<select aria-label="Resume batch" disabled={busy} value={batch?.id ?? ''} onChange={e => void task(async () => { setPending([]); await load(Number(e.target.value)); })}>{batches.map(x => <option value={x.id} key={x.id}>Batch {x.id} · {x.created_at} UTC</option>)}</select></label>}
      {batch&&<DeleteBatchButton key={batch.id} id={batch.id} disabled={busy} onDelete={deleteBatch}/>}
      {cleanupPending>0&&<div className="import-notice"><p role="status">Photo cleanup is pending. Storage is released after cleanup succeeds.</p><div className="import-actions"><button disabled={busy} onClick={()=>void task(async()=>{const result=await api<{cleanup_pending:number}>('/import-batches/cleanup','POST');setCleanupPending(result.cleanup_pending);if(!result.cleanup_pending)setNotice('Photo cleanup finished.');})}>Retry photo cleanup</button></div></div>}
      {batch && <>
        <div className="photo-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) void upload(Array.from(e.dataTransfer.files)); }}>
          <strong>Add front-of-box photos</strong><p>Drop photos here or choose from your library. JPEG, PNG or WebP; up to 12 MB and 25 megapixels each. Convert HEIC photos to JPEG first.</p>
          <PhotoFilePicker key={batch.id} disabled={busy} onFiles={files=>void upload(files)}/>
          <p>After an interruption, select the same files again to retry with their saved keys.</p>
        </div>
        <div className="import-summary" aria-label="Batch summary" aria-live="polite">{['uploaded','image_review','identified','needs_review','approved','imported','failed'].map(key => <div key={key}><strong data-testid={`count-${key}`}>{batch.summary[key]}</strong><span>{key.replace('_',' ')}</span></div>)}</div>
        {(batch.summary.removed??0)>0&&<p>{batch.summary.removed} historically imported copies were removed from the collection.</p>}<progress aria-label="Batch import progress" value={batch.summary.imported + batch.summary.rejected} max={Math.max(1,batch.summary.uploaded)} />
        <p role="status">{busy ? 'Saving your batch… You can resume after a refresh.' : `${batch.summary.queued + batch.summary.processing} awaiting processing / identification · ${batch.summary.rejected} rejected`}</p>
        {(dirty.size > 0 || imageDirty.size > 0) && <p role="status">Save or confirm your edited reviews before approving or importing.</p>}
        <div className="import-actions">
          <button disabled={busy || batch.summary.queued + batch.summary.processing === 0} onClick={() => void task(() => process(batch.id))}>Continue processing / identification</button>
          <button disabled={busy || dirty.size > 0 || imageDirty.size > 0 || !batch.items.some(x => x.reviewed && x.state === 'needs_review')} onClick={() => void task(async () => { const result = await api<Batch>(`/import-batches/${batch.id}/approve-reviewed`,'POST'); show(result); if (result.errors?.length) setError(result.errors.map(x => `Photo ${x.id}: ${x.error}`).join(' ')); })}>Approve reviewed records</button>
          <button className="primary-action" disabled={busy || dirty.size > 0 || imageDirty.size > 0} onClick={() => void task(async () => { let result = await api<Batch>(`/import-batches/${batch.id}/commit`,'POST'); show(result); while (result.summary.approved > 0) { result = await api<Batch>(`/import-batches/${batch.id}/commit`,'POST'); show(result); } setNotice((result.summary.removed??0)>0?`${result.summary.imported-result.summary.removed} copies remain from this batch. ${result.summary.removed} removed copies will not be recreated.`:`${result.summary.imported} private copies saved. Retrying will not add extra copies.`); })}>Import approved copies</button>
        </div>
        {pending.map(item => <div className="setting-card" key={item.key}><strong>{item.name}</strong><p role={item.error ? 'alert' : 'status'}>{item.error ?? 'Uploading…'}</p>{item.state === 'failed' && <button disabled={busy} onClick={() => { if (item.file) void upload([item.file],item); }}>Retry upload</button>}</div>)}
        <div className="review-list">{batch.items.map(item => <ReviewCard key={item.id} item={item} busy={busy} onImageDirty={value => setImageDirty(old => { if (old.has(item.id) === value) return old; const next = new Set(old); if (value) next.add(item.id); else next.delete(item.id); return next; })} photoAction={async (action,data) => { await task(async () => { await refreshItem(await api<ImportItem>(`/import-items/${item.id}/preprocessing/${action}`,'POST',data)); if (action !== 'prepare') await process(batch.id); }); }} onDirty={() => setDirty(old => new Set(old).add(item.id))} save={async data => { await task(async () => { await refreshItem(await api<ImportItem>(`/import-items/${item.id}`,'PATCH',data)); setDirty(old => { const next = new Set(old); next.delete(item.id); return next; }); }); }} action={async action => { await task(async () => { await refreshItem(await api<ImportItem>(`/import-items/${item.id}/${action}`,'POST')); if (action === 'retry') await process(batch.id); }); }} retryUpload={file => void upload([file],{ key: item.client_key, name: item.filename, state: 'failed' })} />)}</div>
      </>}
    </>}
  </div>;
}

export function ReviewCard({ item, busy, save, action, retryUpload, photoAction, onImageDirty, onDirty = () => {} }: { item: ImportItem; busy: boolean; photoAction?: (action:string,data:object) => Promise<void>; onImageDirty?: (dirty:boolean) => void; onDirty?: () => void; save: (data: object) => Promise<void>; action: (name: string) => Promise<void>; retryUpload: (file: File) => void }) {
  const [draft,setDraft] = useState(() => toDraft(item.fields)); const [reviewed,setReviewed] = useState(item.reviewed);
  const [edition,setEdition] = useState(item.linked_edition_id?.toString() ?? '');
  useEffect(() => { setDraft(toDraft(item.fields)); setReviewed(item.reviewed); setEdition(item.linked_edition_id?.toString() ?? ''); }, [item.fields?.title,item.fields?.manufacturer,item.fields?.pieces,item.fields?.product_number,item.fields?.release_year,item.reviewed,item.linked_edition_id]);
  const editable = ['needs_review','approved'].includes(item.state);
  return <article className="review-card" data-testid="import-item">
    {item.image_url && (!photoAction || !item.preprocessing) && <a href={`/api/import-items/${item.id}/original`} aria-label={`Download original ${item.filename}`}><img src={item.image_url} alt={`Puzzle box: ${item.filename}`} loading="lazy" /></a>}
    <div className="review-content"><h2>{item.filename}</h2><span className="import-state">{item.copy_deleted?'Removed from collection':item.state.replace('_',' ')}</span>{item.copy_deleted&&<p>This is retained import history. Retrying import will not recreate the deleted copy.</p>}{photoAction && <ImageReview item={item} busy={busy} run={photoAction} onDirty={onImageDirty}/>}
      {item.error && <p className="import-error" role="alert">{item.error}</p>}
      {item.suggestion && <div className="evidence"><strong>Unverified suggestions · {item.suggestion.confidence} fixture confidence</strong><p>Source: {item.suggestion.provider} / {item.suggestion.source}. Not catalogue verified.</p>{item.suggestion.photo_notes && <p>Visible photo notes (fixture transcription): {item.suggestion.photo_notes}</p>}<p>Compare every field with the photo. Blank means unknown.</p></div>}
      {(item.duplicates.exact_photo.length > 0 || item.duplicates.identity.length > 0) && <p className="duplicate-note">Possible duplicate: {item.duplicates.exact_photo.length > 0 ? `exact SHA-256 photo match with photo(s) ${item.duplicates.exact_photo.map(x => x.id).join(', ')}` : `matching identity with photo(s) ${item.duplicates.identity.join(', ')}`}. Nothing was removed. Importing this record keeps a separate physical copy.</p>}
      {item.fields && <form onSubmit={e => { e.preventDefault(); void save({ ...reviewPayload(draft), reviewed, linked_edition_id: edition ? Number(edition) : null }); }}>
        <div className="review-fields">{(['title','manufacturer','pieces','product_number','release_year'] as const).map(key => <label key={key}>{({ title:'Title', manufacturer:'Manufacturer / brand', pieces:'Pieces', product_number:'Product number', release_year:'Release year' })[key]}<input type={key === 'pieces' || key === 'release_year' ? 'number' : 'text'} aria-label={key === 'title' ? 'Title' : undefined} value={draft[key]} placeholder="Unknown" disabled={!editable || busy} onChange={e => { setDraft({ ...draft, [key]:e.target.value }); setReviewed(false); onDirty(); }} /></label>)}</div>
        {!!item.duplicates.editions.length && <label>Catalogue link<select disabled={!editable || busy} value={edition} onChange={e => { setEdition(e.target.value); setReviewed(false); onDirty(); }}><option value="">Keep or match my private draft edition</option>{item.duplicates.editions.map(x => <option value={x.id} key={x.id}>{x.title} · {x.catalogue_verified ? 'Catalogue verified' : 'My private draft'}</option>)}</select></label>}
        {editable && <><label className="review-check"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => { const checked=e.target.checked; setReviewed(checked); void save({ ...reviewPayload(draft), reviewed:checked, linked_edition_id:edition ? Number(edition) : null }); }} />I reviewed this photo and its fields</label><div className="import-actions"><button type="submit" disabled={busy}>Save review</button><button type="button" disabled={busy || !reviewed || !item.reviewed || item.state === 'approved'} onClick={() => void action('approve')}>Approve</button><button type="button" disabled={busy} onClick={() => void action('reject')}>Reject</button></div></>}
      </form>}
      {item.state === 'failed' && item.preprocessing?.status !== 'failed' && (item.image_url ? <button disabled={busy} onClick={() => void action('retry')}>Retry identification</button> : <label>Retry this photo<input type="file" aria-label={`Retry ${item.filename}`} accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { if (e.target.files?.[0]) retryUpload(e.target.files[0]); }} /></label>)}
    </div>
  </article>;
}
