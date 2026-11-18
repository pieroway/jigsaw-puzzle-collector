import {Settings2} from 'lucide-react';
export function CollectionHeader({onSettings}:{onSettings?:()=>void}) {
  return <header className="page-heading collection-heading"><div><div className="eyebrow">YOUR LITTLE CORNER OF WONDER</div><h1>My Collection<span className="title-dot">.</span></h1><p>Every puzzle has a story worth keeping.</p></div>{onSettings&&<button className="round-icon" aria-label="Collection settings" onClick={onSettings}><Settings2 size={20}/></button>}</header>;
}
