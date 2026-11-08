import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = { vus: 3, duration: '8s', thresholds: { checks: ['rate==1'], http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<800'] } };
const base = __ENV.BASE_URL || 'http://localhost:8080';
export function setup() {
  const session = http.get(`${base}/api/session`);
  const registered = http.post(`${base}/api/auth/register`, JSON.stringify({ email: `load-${Date.now()}@example.test`, password: 'private collector test password' }), { headers: { 'Content-Type':'application/json', 'X-CSRF-Token':session.json('csrf') } });
  if (registered.status !== 201) throw new Error('Could not create isolated load-test account');
  const cookie = `jigsaw_session=${registered.cookies.jigsaw_session[0].value}`;
  const headers = { Cookie:cookie, 'Content-Type':'application/json', 'X-CSRF-Token':registered.json('csrf') };
  const batch = http.post(`${base}/api/import-batches`,JSON.stringify({ client_key:`load-${Date.now()}` }),{headers});
  if (batch.status !== 201) throw new Error('Could not create load-test batch');
  return { id:batch.json('id'), headers };
}
export default function (data) {
  const status = http.get(`${base}/api/import-batches/${data.id}`, { headers:data.headers });
  check(status, { 'batch accessible only with session':r => r.status === 200 && r.json('summary.uploaded') === 0 });
  const list = http.get(`${base}/api/import-batches`, { headers:data.headers });
  check(list, { 'batch list healthy':r => r.status === 200 });
  sleep(0.3);
}
