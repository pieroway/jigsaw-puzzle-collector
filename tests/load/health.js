import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = { vus: 3, duration: '8s', thresholds: { checks: ['rate==1'], http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<800'] } };
export default function () { const r = http.get(`${__ENV.BASE_URL || 'http://localhost:8080'}/api/health`); check(r, { 'healthy': x => x.status === 200 }); sleep(0.3); }
