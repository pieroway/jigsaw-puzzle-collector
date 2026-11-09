import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowUpDown, BookOpen, Check, ChevronDown, Compass, Grid2X2, Heart, Home, List, Moon, Plus, Search, Settings2, SlidersHorizontal, Sun, UserRound, X } from 'lucide-react';
import { filterPuzzles, puzzles, type Puzzle } from './data/puzzles';
import { PuzzleArt } from './components/PuzzleArt';
import { ImportWorkspace } from './import/ImportWorkspace';
import { PrivateCollection } from './import/PrivateCollection';
import { session } from './import/api';
import {SignOutButton} from './components/SignOutButton';
import {LoginPage} from './components/LoginPage';
import './collection-header.css';
import {HomePage} from './components/HomePage';
import {allowNavigation} from './navigation';

type Theme = 'system' | 'light' | 'dark';
type Motion = 'system' | 'on' | 'off';
function preference<T extends string>(key: string, fallback: T): T { const value = localStorage.getItem(key); return (value || fallback) as T; }
export default function App() {
  const [theme, setTheme] = useState<Theme>(() => preference('jigsaw-theme', 'system'));
  const [motion, setMotion] = useState<Motion>(() => preference('jigsaw-motion', 'system'));
  const [speed, setSpeed] = useState(550);
  const [osDark, setOsDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  const [osReduced, setOsReduced] = useState(matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [view, setView] = useState<'gallery' | 'list'>('gallery');
  const [tab, setTab] = useState(() => {
    const saved = localStorage.getItem('jigsaw-tab');
    return saved && ['Home','Collection','Add','Explore','Profile'].includes(saved) ? saved : 'Collection';
  });
  useEffect(() => { localStorage.setItem('jigsaw-tab',tab); }, [tab]);
  const [signedIn, setSignedIn] = useState(false);
  const [requestedBatch,setRequestedBatch]=useState<number|null>(null);
  const [sessionReady,setSessionReady]=useState(false);
  const [loginOpen,setLoginOpen]=useState(false);
  const [loginBusy,setLoginBusy]=useState(false);
  useEffect(() => { void session().then(s => setSignedIn(!!s.user)).catch(() => {}).finally(()=>setSessionReady(true)); }, []);
  useEffect(()=>{if(sessionReady&&!signedIn) setTab(current=>current==='Add'?'Collection':current);},[sessionReady,signedIn]);
  const [selected, setSelected] = useState<Puzzle | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [overlay, setOverlay] = useState<null | { puzzle: Puzzle; rect: DOMRect; to: DOMRect; closing: boolean }>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const scrollRef = useRef(0);
  const returnFocusRef = useRef<number | null>(null);
  const reduced = motion === 'on' || (motion === 'system' && osReduced);
  const dark = theme === 'dark' || (theme === 'system' && osDark);
  const visible = filterPuzzles(puzzles, query, category);
  useEffect(() => { const darkQuery = matchMedia('(prefers-color-scheme: dark)'); const motionQuery = matchMedia('(prefers-reduced-motion: reduce)'); const a = () => setOsDark(darkQuery.matches); const b = () => setOsReduced(motionQuery.matches); darkQuery.addEventListener('change', a); motionQuery.addEventListener('change', b); return () => { darkQuery.removeEventListener('change', a); motionQuery.removeEventListener('change', b); }; }, []);
  useEffect(() => { localStorage.setItem('jigsaw-theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('jigsaw-motion', motion); }, [motion]);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => { document.documentElement.dataset.reducedMotion = reduced ? 'true' : 'false'; }, [reduced]);
  useEffect(() => {
    if (reduced && overlay) {
      if (overlay.closing) setSelected(null);
      setOverlay(null);
      setTransitioning(false);
    }
  }, [reduced, overlay]);
  useLayoutEffect(() => {
    if (selected) {
      returnFocusRef.current = selected.id;
      if (!transitioning) detailRef.current?.querySelector<HTMLButtonElement>('.back-button')?.focus();
      return;
    }
    if (galleryRef.current) {
      galleryRef.current.scrollTop = scrollRef.current;
      const id = returnFocusRef.current;
      if (id !== null) {
        let attempts = 0;
        let timer = 0;
        const restore = () => {
          const card = cardRefs.current[id];
          const active = document.activeElement;
          if (active && active !== document.body && active !== document.documentElement && active !== card) { returnFocusRef.current = null; return; }
          if (card?.isConnected && getComputedStyle(card).visibility === 'visible') card.focus({ preventScroll: true });
          attempts++;
          if (!card || attempts >= 8 || (document.activeElement === card && attempts > 1)) returnFocusRef.current = null;
          else timer = window.setTimeout(restore,32);
        };
        // Confirm focus after the exiting view's native blur settles; never steal focus from a newly chosen control.
        timer = window.setTimeout(restore,16);
        return () => window.clearTimeout(timer);
      }
    }
  }, [selected, transitioning, tab]);
  function openPuzzle(puzzle: Puzzle) {
    if (transitioning) return;
    scrollRef.current = galleryRef.current?.scrollTop || 0;
    const source = cardRefs.current[puzzle.id]?.querySelector('.puzzle-art')?.getBoundingClientRect();
    setSelected(puzzle);
    if (reduced || !source) return;
    setTransitioning(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = detailRef.current?.querySelector('.detail-hero .puzzle-art')?.getBoundingClientRect();
      if (target) setOverlay({ puzzle, rect: source, to: target, closing: false });
      else setTransitioning(false);
    }));
  }
  function closePuzzle() {
    if (!selected || transitioning) return;
    if (reduced) { setFadingOut(true); setTransitioning(true); return; }
    const from = detailRef.current?.querySelector('.detail-hero .puzzle-art')?.getBoundingClientRect();
    const to = cardRefs.current[selected.id]?.querySelector('.puzzle-art')?.getBoundingClientRect();
    if (from && to) { setTransitioning(true); setOverlay({ puzzle: selected, rect: from, to, closing: true }); }
    else setSelected(null);
  }
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && selected) closePuzzle(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); });
  const nav = [{ name: 'Home', icon: Home }, { name: 'Collection', icon: BookOpen }, { name: 'Add', icon: Plus }, { name: 'Explore', icon: Compass }, { name: 'Profile', icon: UserRound }];
  function signedOut() { setSignedIn(false);setLoginOpen(false);setSelected(null);setOverlay(null);setTransitioning(false);setFadingOut(false);setTab('Collection'); }
  function navigate(name:string,batchId?:number) {if(transitioning||loginBusy||(name==='Add'&&!signedIn)||!allowNavigation())return;setRequestedBatch(name==='Add'?batchId??null:null);setLoginOpen(false);setSelected(null);setTab(name);}
  return <div className="app-shell" style={{ '--detail-duration': `${speed}ms` } as CSSProperties}>
    <aside className="desktop-sidebar"><div className="brand"><span className="brand-mark">✦</span><div><strong>Jigsaw</strong><small>PUZZLE COLLECTOR</small></div></div><p className="side-caption">Your puzzles, beautifully kept.</p><nav aria-label="Main navigation">{nav.map(({ name, icon: Icon }) => <button key={name} disabled={loginBusy||(name==='Add'&&!signedIn)} title={name==='Add'&&!signedIn?'Log in to add puzzles':undefined} className={`side-nav ${tab === name ? 'active' : ''}`} onClick={() => navigate(name)}><Icon size={19}/>{name}</button>)}</nav><div className="side-footer">A home for every piece. <span>✦</span></div></aside>
    <main className="device-frame">
      <div className="app-topline"><span className="topline-brand">✦ jigsaw</span><div className="topline-account has-account"><span className="topline-right">THE COLLECTOR'S EDITION</span>{signedIn?<SignOutButton onSignedOut={signedOut}/>:<div className="sign-out-control"><button type="button" disabled={!sessionReady||transitioning||loginBusy} aria-expanded={loginOpen} aria-controls="account-login" onClick={()=>{setSelected(null);setOverlay(null);setLoginOpen(true);}}>Log in</button></div>}</div></div>
      <div className="scroll-area" ref={galleryRef} style={{ visibility: selected ? 'hidden' : undefined }}>
        {loginOpen&&!signedIn?<LoginPage onBusyChange={setLoginBusy} onCancel={()=>setLoginOpen(false)} onAuthenticated={()=>{setSignedIn(true);setLoginOpen(false);setSelected(null);setTab('Collection');}}/>:tab === 'Home' ? <HomePage signedIn={signedIn} sessionReady={sessionReady} onCollection={()=>navigate('Collection')} onAdd={()=>navigate('Add')} onResume={id=>navigate('Add',id)}/>:tab === 'Add'&&signedIn ? <ImportWorkspace initialBatchId={requestedBatch} onSession={setSignedIn} onViewCollection={() => { setSignedIn(true); setTab('Collection'); }} /> : tab === 'Collection' && signedIn ? <PrivateCollection onAdd={() => navigate('Add')} onSettings={()=>navigate('Profile')}/> : tab === 'Collection'||tab==='Add' ? <>
          <header className="page-heading collection-heading"><div><div className="eyebrow">YOUR LITTLE CORNER OF WONDER</div><h1>My Collection<span className="title-dot">.</span></h1><p>Every puzzle has a story worth keeping.</p></div><button className="round-icon" aria-label="Collection settings" onClick={() => setTab('Profile')}><Settings2 size={20}/></button></header>
          <div className="stats"><div><span className="stats-icon">✦</span><strong>{puzzles.length}</strong><small>Puzzles</small></div><div><span className="stats-icon">◈</span><strong>{new Set(puzzles.map(p => p.manufacturer)).size}</strong><small>Manufacturers</small></div><div><span className="stats-icon">♡</span><strong>2</strong><small>On wishlist <em>demo</em></small></div></div>
          <div className="section-title"><h2>The collection</h2><span>Illustrative sample data</span></div>
          <label className="search-field"><Search size={19}/><input aria-label="Search your collection" placeholder="Search your puzzles..." value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={16}/></button>}</label>
          <div className="filter-row"><div className="chip-scroll">{['All', 'Landscape', 'Nature', 'City'].map(x => <button key={x} className={`chip ${category === x ? 'active' : ''}`} onClick={() => setCategory(x)}>{x}</button>)}</div><button className="filter-icon" aria-label="Additional filters not yet implemented" title="Additional filters coming later"><SlidersHorizontal size={18}/></button></div>
          <div className="collection-tools"><span>{visible.length} {visible.length === 1 ? 'puzzle' : 'puzzles'} <ChevronDown size={14}/></span><div><button title="Sorting coming later" aria-label="Sorting coming later"><ArrowUpDown size={17}/></button><button aria-label="Gallery view" aria-pressed={view === 'gallery'} className={view === 'gallery' ? 'tool-active' : ''} onClick={() => setView('gallery')}><Grid2X2 size={18}/></button><button aria-label="List view" aria-pressed={view === 'list'} className={view === 'list' ? 'tool-active' : ''} onClick={() => setView('list')}><List size={19}/></button></div></div>
          <div className={`puzzle-grid ${view === 'list' ? 'list-view' : ''}`}>{visible.map(p => <button key={p.id} ref={el => { cardRefs.current[p.id] = el; }} className="puzzle-card" onClick={() => openPuzzle(p)}><PuzzleArt puzzle={p}/><div className="puzzle-copy"><strong>{p.title}</strong><span>{p.manufacturer}</span><small><span className="piece-symbol">✣</span> {p.pieces.toLocaleString()} pieces <span className="copy-dot">·</span> {p.year}</small></div></button>)}</div>
          {!visible.length && <div className="empty-state">No puzzles match your search. Try another title or category.</div>}
        </> : tab === 'Profile' ? <div className="settings-page"><div className="eyebrow">MAKE IT YOURS</div><h1>Preferences<span className="title-dot">.</span></h1><p>Set the mood for your collection.</p><section className="setting-card"><h2>Appearance</h2><p>Choose your favourite reading-light.</p><div className="segmented" role="group" aria-label="Appearance">{(['system','light','dark'] as const).map(x => <button key={x} className={theme === x ? 'active' : ''} onClick={() => setTheme(x)}>{x === 'system' ? 'System' : x === 'light' ? <><Sun size={14}/> Light</> : <><Moon size={14}/> Dark</>}</button>)}</div></section><section className="setting-card"><h2>Reduce Motion</h2><p>System follows your device preference. On uses a gentle crossfade.</p><div className="segmented" role="group" aria-label="Reduce Motion">{(['system','on','off'] as const).map(x => <button key={x} className={motion === x ? 'active' : ''} onClick={() => setMotion(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}</div><div className="setting-status">Currently: {reduced ? 'Reduced motion' : 'Full motion'}</div></section><section className="setting-card"><h2>Animation feel</h2><p>Relaxed is the approved default.</p><div className="segmented" role="group" aria-label="Animation speed">{[260,400,550].map(x => <button key={x} className={speed === x ? 'active' : ''} onClick={() => setSpeed(x)}>{x === 260 ? 'Quick' : x === 400 ? 'Balanced' : 'Relaxed'}</button>)}</div><div className="setting-status">{speed} ms · {reduced ? 'Motion reduction active' : 'Tap a collection card to try it'}</div></section><button className="primary-action" onClick={() => setTab('Collection')}>Explore the collection</button></div> : <div className="preview-page"><span className="preview-icon">✦</span><div className="eyebrow">COMING IN THE NEXT PHASE</div><h1>{tab}<span className="title-dot">.</span></h1><p>{tab === 'Add' ? 'Catalogue search, barcode scan and manual entry are on the roadmap.' : tab === 'Explore' ? 'A shared catalogue of editions, makers and beautiful finds is coming.' : 'Your personal puzzle dashboard will live here.'}</p><button className="primary-action" onClick={() => setTab('Collection')}>View collection</button></div>}
      </div>
      {selected && <div className={`scroll-area detail-scroll ${reduced ? 'reduced' : ''}`} ref={detailRef} data-leaving={fadingOut} onAnimationEnd={e => { if (e.target === e.currentTarget && fadingOut && e.animationName === 'gentle-fade-out') { setSelected(null); setFadingOut(false); setTransitioning(false); } }}><div className="detail-top"><button className="back-button" disabled={transitioning} onClick={closePuzzle}><ArrowLeft size={20}/> Collection</button><button className="round-icon" aria-label="Favourite (demo only)"><Heart size={19}/></button></div><div className="detail-hero"><PuzzleArt puzzle={selected}/></div><div className="detail-body"><div className="eyebrow">YOUR COLLECTION / {selected.manufacturer.toUpperCase()}</div><div className="detail-heading"><div><h1>{selected.title}</h1><p>{selected.manufacturer} · {selected.edition}</p></div><span className="owned-badge"><Check size={14}/> In Collection</span></div><div className="detail-facts"><div><strong>{selected.pieces.toLocaleString()}</strong><small>Pieces</small></div><div><strong>{selected.year}</strong><small>Released</small></div><div><strong>{selected.dimensions}</strong><small>Dimensions</small></div></div><h2>My copy</h2><div className="detail-info">{[['Condition',selected.condition],['Storage',selected.location],['Acquired',selected.acquired],['Estimated value',selected.value],['Edition',selected.edition]].map(([a,b]) => <div key={a}><span>{a}</span><strong>{b}</strong></div>)}</div><div className="detail-note"><strong>A note about this puzzle</strong><p>{selected.subtitle}. Personal notes and photos will be editable in the next phase.</p></div></div></div>}
      <nav className="bottom-nav" aria-label="Bottom navigation">{nav.map(({ name, icon: Icon }) => <button key={name} disabled={loginBusy||(name==='Add'&&!signedIn)} title={name==='Add'&&!signedIn?'Log in to add puzzles':undefined} aria-label={name} aria-current={tab === name ? 'page' : undefined} className={`${tab === name ? 'active' : ''} ${name === 'Add' ? 'add-nav' : ''}`} onClick={() => navigate(name)}><span className="nav-icon"><Icon size={name === 'Add' ? 24 : 21} strokeWidth={name === 'Add' ? 2.4 : 1.9}/></span><small>{name}</small></button>)}</nav>
    </main>
    {overlay && <div className={`flight ${overlay.closing ? 'closing' : ''}`} style={{ '--from-x': `${overlay.rect.left}px`, '--from-y': `${overlay.rect.top}px`, '--from-w': `${overlay.rect.width}px`, '--from-h': `${overlay.rect.height}px`, '--to-x': `${overlay.to.left}px`, '--to-y': `${overlay.to.top}px`, '--to-w': `${overlay.to.width}px`, '--to-h': `${overlay.to.height}px`, '--flight-duration': `${overlay.closing ? Math.round(speed * .78) : speed}ms` } as CSSProperties} onAnimationEnd={() => { if (overlay.closing) setSelected(null); setOverlay(null); setTransitioning(false); }}><PuzzleArt puzzle={overlay.puzzle}/></div>}
    <aside className="desktop-note"><span>✦</span><strong>A little joy,<br/>piece by piece.</strong><p>Beautifully organised. Always yours.</p><div className="note-rule"/><small>DESIGN PREVIEW · NOV 2026</small></aside>
  </div>;
}
