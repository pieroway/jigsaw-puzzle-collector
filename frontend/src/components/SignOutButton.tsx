import {useState} from 'react';
import {api} from '../import/api';
import './SignOutButton.css';

export function SignOutButton({onSignedOut}:{onSignedOut:()=>void}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function signOut() {
    if(busy) return;
    setBusy(true); setError('');
    try { await api('/auth/logout','POST'); onSignedOut(); }
    catch(error) { setError(error instanceof Error?error.message:'Could not sign out. Please retry.'); }
    finally { setBusy(false); }
  }
  return <div className="sign-out-control"><button type="button" disabled={busy} onClick={()=>void signOut()}>{busy?'Signing out…':'Sign out'}</button>{error&&<span role="alert">{error}</span>}</div>;
}
