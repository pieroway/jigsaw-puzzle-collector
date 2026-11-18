import {test,expect} from '@playwright/test';
test('loading and failure stay centered below an unmoving collection banner, then retry succeeds',async({page})=>{
  await page.setViewportSize({width:390,height:844});let allowSession!:()=>void,failCollection!:()=>void;
  const sessionGate=new Promise<void>(resolve=>{allowSession=resolve;}),collectionGate=new Promise<void>(resolve=>{failCollection=resolve;});let calls=0;let allowSuccess=false;
  await page.route('**/api/session',async route=>{await sessionGate;await route.fulfill({json:{user:{id:7,email:'fixture@example.test'},csrf:'fixture'}});});
  await page.route('**/api/collection',async route=>{calls++;if(!allowSuccess){await collectionGate;await route.fulfill({status:503,json:{error:'Connection interrupted. Please retry.'}});}else await route.fulfill({json:{copies:[]}});});
  await page.goto('/');await expect(page.getByRole('status',{name:'Loading collection'})).toBeVisible();const header=page.locator('.collection-heading');const initial=await header.boundingBox();expect(initial).toBeTruthy();
  async function stable(){const box=await header.boundingBox();expect(Math.abs(box!.y-initial!.y)).toBeLessThan(1);expect(box!.height).toBe(initial!.height);}
  const spinner=page.locator('.collection-spinner');const loadingBox=await page.locator('.collection-load-state').boundingBox();const spinBox=await spinner.boundingBox();expect(spinBox!.y).toBeGreaterThan(initial!.y+initial!.height);expect(Math.abs(spinBox!.y+spinBox!.height/2-loadingBox!.y-loadingBox!.height/2)).toBeLessThan(1);
  allowSession();await expect.poll(()=>calls).toBeGreaterThan(0);await stable();failCollection();await expect(page.getByRole('alert',{name:'Collection loading failed'})).toBeVisible();await stable();await expect(spinner).toHaveCount(0);await expect(page.locator('.collection-load-feedback svg')).toBeVisible();
  const failureBox=await page.locator('.collection-load-state').boundingBox();expect(failureBox!.y).toBe(loadingBox!.y);expect(failureBox!.height).toBe(loadingBox!.height);
  allowSuccess=true;await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByText(/Your shelves are ready/)).toBeVisible();await stable();await expect(page.getByRole('alert')).toHaveCount(0);
});
