export type Session = { user: { id: number; email: string } | null; csrf: string };
let token = '';
let currentSession: Promise<Session> | undefined;
export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const form = data instanceof FormData;
  if (method !== 'GET') headers['X-CSRF-Token'] = token;
  if (data && !form) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers, body: data ? form ? data as FormData : JSON.stringify(data) : method === 'POST' ? '{}' : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed. Please retry.');
  if (result.csrf) { token = result.csrf; currentSession = Promise.resolve(result as Session); }
  return result as T;
}
export const session = () => currentSession ??= api<Session>('/session').catch(error => { currentSession = undefined; throw error; });
