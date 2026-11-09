import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowRight,BookOpen,Plus} from 'lucide-react';
import {api} from '../import/api';
import {PrivateCopyDetails,type Copy} from '../import/PrivateCopyDetails';
import './HomePage.css';
import {allowNavigation} from '../navigation';
type BatchSummary={id:number;created_at:string;remaining:number;image_review:number;needs_review:number;failed:number;approved:number;queued:number;processing:number};
type Summary={totals:{puzzles:number;manufacturers:number;known_pieces:number};batches:BatchSummary[];recent:Copy[]};
type Props={signedIn:boolean;sessionReady:boolean;onCollection:()=>void;onAdd:()=>void;onResume:(id:number)=>void};
function batchDescription(batch:BatchSummary) {
  return [[batch.image_review,'photo','to prepare'],[batch.needs_review,'puzzle','to review'],[batch.failed,'photo','to retry'],[batch.approved,'puzzle','ready to import'],[batch.queued+batch.processing,'photo','awaiting processing']].filter(([count])=>Number(count)>0).map(([count,noun,action])=>`${count} ${noun}${Number(count)===1?'':'s'} ${action}`).join(' · ');
}
export function HomePage({signedIn,sessionReady,onCollection,onAdd,onResume}:Props) {
  const [data,setData]=useState<Summary|null>(null);const [error,setError]=useState('');const [attempt,setAttempt]=useState(0);
  const [selected,setSelected]=useState<Copy|null>(null);const root=useRef<HTMLDivElement>(null);
  const scroll=useRef(0);const returnCopy=useRef<number|null>(null);
  const generation=useRef(0);
  useEffect(()=>{
    let alive=true;generation.current++;setData(null);setError('');setSelected(null);
    if(signedIn&&sessionReady) void api<Summary>('/home').then(value=>{if(alive)setData(value);}).catch(reason=>{if(alive)setError(reason instanceof Error?reason.message:'Home could not load. Please retry.');});
    return ()=>{alive=false;generation.current++;};
  },[signedIn,sessionReady,attempt]);
  useLayoutEffect(()=>{
    const scroller=root.current?.closest('.scroll-area');
    if(selected) {if(scroller)scroller.scrollTop=0;root.current?.querySelector<HTMLButtonElement>('.back-button')?.focus();}
    else if(returnCopy.current!==null) {if(scroller)scroller.scrollTop=scroll.current;root.current?.querySelector<HTMLButtonElement>(`[data-home-copy-id="${returnCopy.current}"]`)?.focus({preventScroll:true});returnCopy.current=null;}
  },[selected?.id]);
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&allowNavigation())setSelected(null);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
  function open(copy:Copy) {scroll.current=root.current?.closest('.scroll-area')?.scrollTop??0;returnCopy.current=copy.id;setSelected(copy);}
  function updated(copy:Copy) {
    const current=generation.current;
    setSelected(copy);setData(old=>old?{...old,recent:old.recent.map(value=>value.id===copy.id?copy:value)}:old);
    void api<Summary>('/home').then(value=>{if(current===generation.current)setData(value);}).catch(()=>{if(current===generation.current)setError('Your copy is saved, but Home totals could not refresh. Use Retry Home.');});
  }
  return <div ref={root} className="home-page private-collection">
    {signedIn&&selected?<PrivateCopyDetails key={selected.id} copy={selected} onBack={()=>setSelected(null)} onUpdated={updated} backLabel="Home"/>:<>
      <header className="page-heading collection-heading home-heading"><div><div className="eyebrow">A HOME FOR EVERY PIECE</div><h1>Welcome home<span className="title-dot">.</span></h1><p>A little joy, piece by piece.</p></div></header>
      <div className="home-intro">
        {!sessionReady?<p role="status">Opening your Home…</p>:!signedIn?<p>Your puzzles, beautifully kept. Browse the sample collection, or log in using the header to start your own.</p>:data?<p className="home-totals">{data.totals.puzzles.toLocaleString()} puzzles · {data.totals.manufacturers.toLocaleString()} manufacturers <span>{data.totals.known_pieces.toLocaleString()} known pieces in your collection</span></p>:!error&&<p role="status">Gathering your latest puzzles…</p>}
        <div className="home-actions"><button className="primary-action" onClick={onCollection}><BookOpen size={17}/>{signedIn?'View collection':'Browse sample collection'}</button><button className="home-secondary" disabled={!signedIn||!sessionReady} onClick={onAdd}><Plus size={17}/>Import photos</button></div>
      </div>
      {signedIn&&error&&<div className="home-error"><p role="alert" className="import-error">{error}</p><button className="home-secondary" onClick={()=>setAttempt(value=>value+1)}>Retry Home</button></div>}
      {signedIn&&data&&<>
        {data.batches.length>0&&<section className="home-section" aria-labelledby="home-imports"><div className="section-title"><h2 id="home-imports">Continue your import</h2><span>A few pieces left to place</span></div><div className="home-batches">{data.batches.map(batch=><button className="home-batch" key={batch.id} aria-label={`Continue batch ${batch.id}`} onClick={()=>onResume(batch.id)}><span><strong>Batch {batch.id}</strong><small>{batch.remaining} {batch.remaining===1?'photo needs':'photos need'} attention</small><span>{batchDescription(batch)}</span></span><ArrowRight size={20} aria-hidden="true"/></button>)}</div></section>}
        <section className="home-section" aria-labelledby="home-recent"><div className="section-title"><h2 id="home-recent">Recently added</h2>{data.recent.length>0&&<button className="collection-add-link" onClick={onCollection}>See all <ArrowRight size={14}/></button>}</div>
          {!data.recent.length?<div className="home-empty"><strong>Your first puzzle belongs here.</strong><p>Start with a few box photos. We’ll keep the originals safe while you prepare and review each puzzle.</p></div>:<div className="puzzle-grid private-grid home-recent">{data.recent.map(copy=><button className="puzzle-card" key={copy.id} data-home-copy-id={copy.id} onClick={()=>open(copy)}><div className={`collection-art ${copy.uses_studio?'studio-surface':''}`} data-background={copy.studio_background}>{copy.image_url?<img src={copy.image_url} alt={`Box photo of ${copy.title}`} loading="lazy" decoding="async"/>:<span>No box photo</span>}</div><div className="puzzle-copy"><strong>{copy.title}</strong><span>{copy.manufacturer?.trim()||'Unknown manufacturer'}</span><small>{copy.piece_count?Number(copy.piece_count).toLocaleString():'Unknown'} pieces</small></div></button>)}</div>}
        </section>
      </>}
    </>}
  </div>;
}
