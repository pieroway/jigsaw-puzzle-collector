import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('different accounts can upload concurrently without cross-account deadlocks', async ({ playwright, baseURL }) => {
  const photo=await readFile('/fixtures/photos/puzzle-01.jpg');
  const accounts=await Promise.all(Array.from({length:4},async (_,i)=>{
    const request=await playwright.request.newContext({baseURL});
    const session=await (await request.get('/api/session')).json();
    const response=await request.post('/api/auth/register',{headers:{'X-CSRF-Token':session.csrf},data:{email:`concurrent-${Date.now()}-${i}@example.test`,password:'concurrent fixture password 42!'}});
    expect(response.status()).toBe(201);
    const user=await response.json();
    const headers={'X-CSRF-Token':user.csrf};
    const batch=await request.post('/api/import-batches',{headers,data:{client_key:'concurrent-batch'}});
    expect(batch.status()).toBe(201);
    return {request,headers,id:(await batch.json()).id};
  }));
  try {
    for(let round=0;round<4;round++) {
      const responses=await Promise.all(accounts.map(({request,headers,id})=>request.post(`/api/import-batches/${id}/photos`,{headers,multipart:{client_key:`photo-${round}`,photo:{name:'puzzle-01.jpg',mimeType:'image/jpeg',buffer:photo}}})));
      for(const response of responses) expect(response.status(),await response.text()).toBe(201);
    }
    for(const {request,id} of accounts) {
      const batch=await (await request.get(`/api/import-batches/${id}`)).json();
      expect(batch.items).toHaveLength(4);
    }
  } finally { await Promise.all(accounts.map(({request})=>request.dispose())); }
});
