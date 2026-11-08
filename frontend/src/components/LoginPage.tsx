import {useState} from 'react';
import {api,session,type Session} from '../import/api';
import '../import/import.css';

export function LoginPage({onAuthenticated,onCancel,onBusyChange}:{onAuthenticated:()=>void;onCancel:()=>void;onBusyChange:(busy:boolean)=>void}) {
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function authenticate(register=false) {
    if(busy) return;
    setBusy(true);onBusyChange(true);setError('');
    try {
      await session();
      const result=await api<Session>(register?'/auth/register':'/auth/login','POST',{email,password});
      if(!result.user) throw new Error('Could not log in. Please retry.');
      setPassword('');onAuthenticated();
    } catch(error) {setError(error instanceof Error?error.message:'Could not log in. Please retry.');}
    finally {setBusy(false);onBusyChange(false);}
  }
  return <section id="account-login" className="import-workspace login-page">
    <div className="eyebrow">YOUR PRIVATE COLLECTION</div><h1>Log in<span className="title-dot">.</span></h1>
    <p>Log in before adding puzzles to your collection.</p>
    <form className="setting-card" aria-label="Account login" onSubmit={event=>{event.preventDefault();void authenticate();}}>
      {error&&<p className="import-error" role="alert">{error}</p>}
      <label>Email<input type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} required disabled={busy}/></label>
      <label>Password<input type="password" autoComplete="current-password" minLength={12} maxLength={72} value={password} onChange={event=>setPassword(event.target.value)} required disabled={busy}/></label>
      <div className="import-actions"><button type="submit" className="primary-action" disabled={busy}>{busy?'Logging in…':'Log in'}</button><button type="button" disabled={busy||!email||password.length<12} onClick={()=>void authenticate(true)}>Create private account</button><button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
    </form>
  </section>;
}
