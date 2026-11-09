import {useState} from 'react';
import {FloatingCopyNotice} from './FloatingCopyNotice';

import {api} from './api';
import './CopyDeletion.css';
export type CopyRemoval={copy_id:number;deleted?:boolean;already_deleted?:boolean;cleanup_pending?:number;missing?:boolean};
export function CopyRemovalNotice({removal}:{removal:CopyRemoval}) {
  const [pending,setPending]=useState(removal.cleanup_pending??0);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function retry() {
    if(busy)return;setBusy(true);setError('');
    try {const result=await api<{cleanup_pending:number}>('/import-batches/cleanup','POST');setPending(result.cleanup_pending);}
    catch(reason){setError(reason instanceof Error?reason.message:'Photo cleanup could not finish. Retry.');}
    finally{setBusy(false);}
  }
  return <FloatingCopyNotice paused={busy}><p role="status">{removal.missing?'This copy is no longer in your collection.':'Copy deleted.'} Photos still used by import history or other copies were kept.{pending>0?' Unused photo cleanup is pending. You can also retry from Add.':''}</p>{pending>0&&<button type="button" disabled={busy} onClick={()=>void retry()}>{busy?'Retrying cleanup…':'Retry photo cleanup'}</button>}{error&&<p role="alert" className="import-error">{error}</p>}</FloatingCopyNotice>;
}
