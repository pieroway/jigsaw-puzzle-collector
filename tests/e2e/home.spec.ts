import {test,expect} from '@playwright/test';
test('Home keeps guests public and resumes the selected private import',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  await page.goto('/');await page.getByRole('button',{name:'Home',exact:true}).last().click();
  await expect(page.getByRole('button',{name:'Browse sample collection'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Import photos',exact:true})).toBeDisabled();
  const session=await(await page.request.get('/api/session')).json();
  const account=await page.request.post('/api/auth/register',{headers:{'X-CSRF-Token':session.csrf},data:{email:`home-${Date.now()}@example.test`,password:'home fixture password 123'}});
  expect(account.status()).toBe(201);const auth=await account.json();
  const batch=await(await page.request.post('/api/import-batches',{headers:{'X-CSRF-Token':auth.csrf},data:{client_key:'home-review'}})).json();
  const pixels=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;const context=canvas.getContext('2d')!;context.fillStyle='#888';context.fillRect(0,0,160,120);return canvas.toDataURL('image/png').split(',')[1];});
  expect((await page.request.post(`/api/import-batches/${batch.id}/photos`,{headers:{'X-CSRF-Token':auth.csrf},multipart:{client_key:'one',photo:{name:'home.png',mimeType:'image/png',buffer:Buffer.from(pixels,'base64')}}})).status()).toBe(201);
  await page.reload();await expect(page.getByRole('button',{name:`Continue batch ${batch.id}`})).toBeVisible();
  await page.getByRole('button',{name:`Continue batch ${batch.id}`}).click();
  await expect(page.getByRole('combobox',{name:'Resume batch'})).toHaveValue(String(batch.id));
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.locator('html')).toHaveAttribute('data-reduced-motion','true');
});
