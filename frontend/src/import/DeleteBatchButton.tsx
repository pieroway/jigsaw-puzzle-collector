import {useState} from 'react';
export function DeleteBatchButton({id,disabled,onDelete}:{id:number;disabled:boolean;onDelete:(id:number)=>Promise<boolean>}) {
  const [confirm,setConfirm]=useState(false);const [pending,setPending]=useState(false);const [error,setError]=useState('');
  async function remove() {
    if(disabled||pending) return;
    setPending(true);setError('');
    try {if(await onDelete(id)) setConfirm(false);}
    catch {setError('Could not delete this batch. Please retry.');}
    finally {setPending(false);}
  }
  return <div className="batch-delete">
    <button type="button" disabled={disabled||pending} onClick={()=>setConfirm(true)}>Delete batch</button>
    {confirm&&<section className="batch-delete-confirm" role="alertdialog" aria-label={`Delete batch ${id}`} aria-describedby={`delete-batch-${id}`}>
      <p id={`delete-batch-${id}`}>Delete batch {id}? Unimported photos and reviews will be permanently deleted. Puzzles already imported into your collection and their photographs will be kept.</p>
      {error&&<p role="alert">{error}</p>}
      <div className="import-actions"><button type="button" disabled={disabled||pending} onClick={()=>void remove()}>{pending?'Deleting…':'Delete batch permanently'}</button><button type="button" disabled={disabled||pending} onClick={()=>{setConfirm(false);setError('');}}>Keep batch</button></div>
    </section>}
  </div>;
}
