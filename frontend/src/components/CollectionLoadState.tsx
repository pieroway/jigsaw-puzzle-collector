import {CircleAlert} from 'lucide-react';
import './CollectionLoadState.css';
export function CollectionLoadState({error,onRetry}:{error?:string;onRetry?:()=>void}) {
  return <div className="collection-load-state" role={error?'alert':'status'} aria-label={error?'Collection loading failed':'Loading collection'}>
    {error?<div className="collection-load-feedback"><CircleAlert size={30} aria-hidden="true"/><strong>Could not load your collection</strong><p>{error}</p><div className="import-actions"><button type="button" onClick={onRetry}>Retry</button></div></div>:<span className="collection-spinner" aria-hidden="true"/>}
  </div>;
}
