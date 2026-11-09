import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api';
import {ArrowUpDown,ChevronDown,Grid2X2,List,Plus,Search,Settings2,SlidersHorizontal,X} from 'lucide-react';
import {PrivateCopyDetails,type Copy} from './PrivateCopyDetails';
import {allowNavigation} from '../navigation';
import {CopyRemovalNotice,type CopyRemoval} from './CopyRemovalNotice';
const makerKey=(value:string|null)=>value?.trim()?`brand:${value.trim().toLocaleLowerCase()}`:'unknown';
export function PrivateCollection({ onAdd,onSettings }: { onAdd: () => void;onSettings?:()=>void }) {
  const [copies,setCopies] = useState<Copy[]>([]); const [selected,setSelected] = useState<Copy | null>(null);

  const [query,setQuery] = useState(''); const [error,setError] = useState(''); const [loaded,setLoaded] = useState(false);
  const [layout,setLayout]=useState<'gallery'|'list'>('gallery');
  const [maker,setMaker]=useState('all');const [pieces,setPieces]=useState('all');
  const [filtersOpen,setFiltersOpen]=useState(false);const [sort,setSort]=useState('newest');
  const [removal,setRemoval]=useState<CopyRemoval|null>(null);
  const makers=new Map<string,string>();
  for(const copy of copies) if(copy.manufacturer?.trim()&&!makers.has(makerKey(copy.manufacturer))) makers.set(makerKey(copy.manufacturer),copy.manufacturer.trim());
  const makerOptions=[...makers].sort((a,b)=>a[1].localeCompare(b[1],undefined,{sensitivity:'base'}));
  const pieceOptions=[...new Set(copies.map(copy=>Number(copy.piece_count)).filter(count=>count>0))].sort((a,b)=>a-b);
  const knownPieces=copies.reduce((total,copy)=>total+(Number(copy.piece_count)||0),0);
  const search=query.trim().toLocaleLowerCase();
  const visible=copies.filter(copy=>(maker==='all'||makerKey(copy.manufacturer)===maker)&&(pieces==='all'||(pieces==='unknown'?!copy.piece_count:Number(copy.piece_count)===Number(pieces)))&&`${copy.title} ${copy.manufacturer??''} ${copy.piece_count??''} ${copy.sku??''} ${copy.release_year??''}`.toLocaleLowerCase().includes(search)).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,undefined,{sensitivity:'base'}):sort==='pieces'?(Number(a.piece_count)||Infinity)-(Number(b.piece_count)||Infinity)||a.title.localeCompare(b.title):Number(b.id)-Number(a.id));
  function clearFilters(){setQuery('');setMaker('all');setPieces('all');}
  const root = useRef<HTMLDivElement>(null); const scroll = useRef(0); const returnCopy = useRef<number | null>(null);
  function open(copy: Copy) {setRemoval(null);scroll.current = root.current?.closest('.scroll-area')?.scrollTop ?? 0; returnCopy.current = copy.id; setSelected(copy); }
  function removed(result:CopyRemoval) {
    const index=visible.findIndex(copy=>copy.id===result.copy_id);const remaining=copies.filter(copy=>copy.id!==result.copy_id);
    returnCopy.current=(visible[index+1]??visible[index-1]??remaining[0])?.id??0;
    setCopies(remaining);setSelected(null);setRemoval(result);
    if(maker!=='all'&&!remaining.some(copy=>makerKey(copy.manufacturer)===maker))setMaker('all');
    if(pieces!=='all'&&!remaining.some(copy=>pieces==='unknown'?!copy.piece_count:Number(copy.piece_count)===Number(pieces)))setPieces('all');
  }
  useLayoutEffect(() => {
    const scroller = root.current?.closest('.scroll-area');
    if (selected) { if (scroller) scroller.scrollTop = 0; root.current?.querySelector<HTMLButtonElement>('.back-button')?.focus(); }
    else if (returnCopy.current !== null) { if (scroller) scroller.scrollTop = scroll.current; (root.current?.querySelector<HTMLElement>(`[data-copy-id="${returnCopy.current}"]`)??root.current?.querySelector<HTMLElement>('.empty-state button')??root.current?.querySelector<HTMLElement>('.search-field input'))?.focus({ preventScroll:true }); returnCopy.current = null; }
  },[selected?.id]);
  useEffect(() => { void api<{ copies: Copy[] }>('/collection').then(x => setCopies(x.copies)).catch(e => setError(e.message)).finally(() => setLoaded(true)); }, []);
  useEffect(() => { const handle = (e: KeyboardEvent) => { if (e.key === 'Escape'&&allowNavigation()) setSelected(null); }; window.addEventListener('keydown',handle); return () => window.removeEventListener('keydown',handle); }, []);
  return <div className="private-collection" ref={root}>
    {removal&&!selected&&<CopyRemovalNotice key={removal.copy_id} removal={removal}/>}
    {error && <p role="alert" className="import-error">{error}</p>}
    {!loaded && <p role="status">Opening your collection…</p>}
    {selected ? <PrivateCopyDetails copy={selected} onBack={()=>setSelected(null)} onRemoved={removed} onUpdated={copy=>{setCopies(old=>old.map(value=>value.id===copy.id?copy:value));setSelected(copy);}}/> : <>
      <header className="page-heading collection-heading"><div><div className="eyebrow">YOUR LITTLE CORNER OF WONDER</div><h1>My Collection<span className="title-dot">.</span></h1><p>Every puzzle has a story worth keeping.</p></div>{onSettings&&<button className="round-icon" aria-label="Collection settings" onClick={onSettings}><Settings2 size={20}/></button>}</header>
      <div className="stats" role="group" aria-label="Collection totals">
        <div><span className="stats-icon" aria-hidden="true">✦</span><strong>{loaded?copies.length.toLocaleString():'—'}</strong><small>Puzzles</small></div>
        <div><span className="stats-icon" aria-hidden="true">◈</span><strong>{loaded?makers.size.toLocaleString():'—'}</strong><small>Manufacturers</small></div>
        <div title="Sum of known piece counts; unknown counts are excluded"><span className="stats-icon" aria-hidden="true">✣</span><strong>{loaded?knownPieces.toLocaleString():'—'}</strong><small>Known pieces</small></div>
      </div>
      <div className="section-title"><h2>The collection</h2><button className="collection-add-link" onClick={onAdd}><Plus size={14}/>Import more photos</button></div>
      <p className="collection-privacy">Only you can see these {copies.length} physical copies.</p>
      <label className="search-field"><Search size={19} aria-hidden="true"/><input aria-label="Search your collection" placeholder="Search your puzzles..." value={query} disabled={!loaded} onChange={event=>setQuery(event.target.value)}/>{query&&<button aria-label="Clear search" onClick={()=>setQuery('')}><X size={16}/></button>}</label>
      <div className="filter-row"><div className="chip-scroll" role="group" aria-label="Manufacturer filters"><button className={`chip ${maker==='all'?'active':''}`} aria-pressed={maker==='all'} onClick={()=>setMaker('all')}>All</button>{makerOptions.map(([key,label])=><button key={key} className={`chip ${maker===key?'active':''}`} aria-pressed={maker===key} onClick={()=>setMaker(key)}>{label}</button>)}{copies.some(copy=>makerKey(copy.manufacturer)==='unknown')&&<button className={`chip ${maker==='unknown'?'active':''}`} aria-pressed={maker==='unknown'} onClick={()=>setMaker('unknown')}>Unknown maker</button>}</div><button className="filter-icon" aria-label="Filter by piece count" aria-expanded={filtersOpen} aria-controls="private-piece-filters" onClick={()=>setFiltersOpen(value=>!value)}><SlidersHorizontal size={18}/></button></div>
      {filtersOpen&&<div className="collection-filter-panel" id="private-piece-filters"><label>Piece count<select aria-label="Piece count" value={pieces} onChange={event=>setPieces(event.target.value)}><option value="all">All piece counts</option>{pieceOptions.map(count=><option key={count} value={count}>{count.toLocaleString()} pieces</option>)}{copies.some(copy=>!copy.piece_count)&&<option value="unknown">Unknown</option>}</select></label><button onClick={clearFilters}>Clear filters</button></div>}
      <div className="collection-tools"><span aria-live="polite">{visible.length} {visible.length===1?'puzzle':'puzzles'} <ChevronDown size={14}/></span><div><label className="collection-sort"><ArrowUpDown size={17} aria-hidden="true"/><select aria-label="Sort collection" value={sort} onChange={event=>setSort(event.target.value)}><option value="newest">Newest first</option><option value="title">Title A–Z</option><option value="pieces">Piece count</option></select></label><button aria-label="Gallery view" aria-pressed={layout==='gallery'} className={layout==='gallery'?'tool-active':''} onClick={()=>setLayout('gallery')}><Grid2X2 size={18}/></button><button aria-label="List view" aria-pressed={layout==='list'} className={layout==='list'?'tool-active':''} onClick={()=>setLayout('list')}><List size={19}/></button></div></div>
      {loaded&&!error&&!copies.length&&<div className="empty-state">Your shelves are ready. Start with a batch of box photos.<div className="import-actions"><button className="primary-action" onClick={onAdd}>Import your first puzzles</button></div></div>}
      {loaded&&!error&&copies.length>0&&!visible.length&&<div className="empty-state">No puzzles match your search or filters.<div className="import-actions"><button onClick={clearFilters}>Clear filters</button></div></div>}
      <div className={`puzzle-grid private-grid ${layout==='list'?'list-view':''}`}>{visible.map(copy=><button data-testid="private-copy" data-copy-id={copy.id} className="puzzle-card" key={copy.id} onClick={()=>open(copy)}><div className={`collection-art ${copy.uses_studio?'studio-surface':''}`} data-background={copy.studio_background}>{copy.image_url?<img src={copy.image_url} alt={`Box photo of ${copy.title}`} loading="lazy" decoding="async"/>:<span>No box photo</span>}</div><div className="puzzle-copy"><strong>{copy.title}</strong><span>{copy.manufacturer?.trim()||'Unknown manufacturer'}</span><small><span className="piece-symbol">✣</span> {copy.piece_count?Number(copy.piece_count).toLocaleString():'Unknown'} pieces <span className="copy-dot">·</span> {copy.release_year??'Private copy'}</small></div></button>)}</div>
    </>}
  </div>;
}
