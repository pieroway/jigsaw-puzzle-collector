export type Session = { user: { id: number; email: string } | null; csrf: string };
let token = '';
let currentSession: Promise<Session> | undefined;
export class ApiError extends Error {
  constructor(message:string,public status:number,public fields?:Record<string,string>) {super(message);this.name='ApiError';}
}
type RequestOptions={signal?:AbortSignal;timeoutMs?:number};
export async function api<T>(path: string, method = 'GET', data?: unknown, options:RequestOptions={}): Promise<T> {
  const headers: Record<string, string> = {};
  const form = data instanceof FormData;
  if (method !== 'GET') headers['X-CSRF-Token'] = token;
  if (data && !form) headers['Content-Type'] = 'application/json';
  const controller=new AbortController();let timedOut=false;
  const abort=()=>controller.abort();
  if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
  // Reads may be retried safely. Do not time out mutations whose commit status would be uncertain.
  const timeout=options.timeoutMs??(method==='GET'?15000:0);
  const timer=timeout>0?window.setTimeout(()=>{timedOut=true;controller.abort();},timeout):undefined;
  try {
    const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers, signal:controller.signal, body: data ? form ? data as FormData : JSON.stringify(data) : method === 'POST' ? '{}' : undefined });
    const result = await response.json();
    if (!response.ok) throw new ApiError(result.error || 'Request failed. Please retry.',response.status,result.fields);
    if (result.csrf) { token = result.csrf; currentSession = Promise.resolve(result as Session); }
    return result as T;
  } catch(error) {
    if(timedOut)throw new ApiError('Loading took too long. Check your connection and retry.',408);
    throw error;
  } finally {if(timer!==undefined)window.clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
export const session = () => currentSession ??= api<Session>('/session').catch(error => { currentSession = undefined; throw error; });
