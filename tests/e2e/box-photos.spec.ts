import {test,expect} from '@playwright/test';
test('box photo dots, swipe wraparound and direct add and delete on mobile',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  test.setTimeout(180000);await page.setViewportSize({width:390,height:844});await page.goto('/');
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await page.getByLabel('Email').fill(`photos-${Date.now()}@example.test`);await page.getByLabel('Password',{exact:true}).fill('Fixture collector password 42!');
  await page.getByRole('button',{name:'Create private account'}).click();await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Add',exact:true}).last().click();await page.getByRole('button',{name:'New photo batch'}).click();
  await expect(page.getByLabel('Choose puzzle photos')).toBeEnabled();
  await page.getByLabel('Choose puzzle photos').setInputFiles(['/fixtures/photos/puzzle-01.jpg','/fixtures/photos/puzzle-02.jpg']);
  await expect(page.getByTestId('count-image_review')).toHaveText('2',{timeout:90000});
  for(const card of await page.getByTestId('import-item').all())await card.getByRole('button',{name:'Use processed image',exact:true}).click();
  for(const card of await page.getByTestId('import-item').all()){await card.getByLabel('I reviewed this photo and its fields').check();await expect(card.getByRole('button',{name:'Approve',exact:true})).toBeEnabled();}
  await page.getByRole('button',{name:'Approve reviewed records'}).click();await expect(page.getByTestId('count-approved')).toHaveText('2');
  await page.getByRole('button',{name:'Import approved copies'}).click();await expect(page.getByTestId('count-imported')).toHaveText('2');await page.getByRole('button',{name:'View private collection'}).click();
  await expect(page.getByTestId('private-copy')).toHaveCount(2);
  await page.getByTestId('private-copy').first().click();const photos=page.getByRole('region',{name:'Puzzle photos'});
  await expect(photos.getByRole('button',{name:'Add photo',exact:true})).toBeEnabled();
  await expect(photos.getByRole('button',{name:'Show photo 1',exact:true})).toHaveCount(0);
  await expect(photos.getByRole('button',{name:'Manage photos'})).toHaveCount(0);
  for(let i=1;i<=7;i++){
    const chooser=page.waitForEvent('filechooser');await photos.getByRole('button',{name:'Add photo',exact:true}).click();await(await chooser).setFiles('/fixtures/photos/puzzle-02.jpg');
    await expect(photos.getByRole('button',{name:`Show photo ${i+1}`,exact:true})).toHaveAttribute('aria-pressed','true');
  }
  await expect(photos.getByRole('button',{name:'Add photo',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Original',exact:true}).click();
  await expect(photos.locator('.box-photo-current img')).toHaveAttribute('src',/original-image\?display=960$/);
  await expect(photos.locator('.box-photo-current img')).toHaveJSProperty('complete',true);
  expect(await photos.locator('.box-photo-current img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
  const displayedUrl=await photos.locator('.box-photo-current img').getAttribute('src');
  expect(displayedUrl).toBeTruthy();const smallUrl=displayedUrl!.replace('display=960','display=480');
  const optimized=await page.request.get(smallUrl);expect(optimized.status()).toBe(200);expect(optimized.headers()['content-type']).toContain('image/webp');expect(optimized.headers()['cache-control']).toContain('private');expect(optimized.headers()['cache-control']).toContain('must-revalidate');
  const etag=optimized.headers().etag;expect(etag).toBeTruthy();
  const revalidated=await page.request.get(smallUrl,{headers:{'If-None-Match':etag}});expect(revalidated.status()).toBe(304);
  const full=await page.request.get(displayedUrl!.split('?')[0]);expect((await optimized.body()).length).toBeLessThan((await full.body()).length);
  console.log('Original / display bytes:',(await full.body()).length,(await optimized.body()).length);
  const outsider=await page.context().browser()!.newContext({baseURL:test.info().project.use.baseURL});
  try {
    expect((await outsider.request.get(smallUrl,{headers:{'If-None-Match':etag}})).status()).toBe(401);
    const session=await(await outsider.request.get('/api/session')).json();
    const registered=await outsider.request.post('/api/auth/register',{headers:{'X-CSRF-Token':session.csrf},data:{email:`image-outsider-${Date.now()}@example.test`,password:'Private outsider fixture password'}});expect(registered.status()).toBe(201);
    expect((await outsider.request.get(smallUrl,{headers:{'If-None-Match':etag}})).status()).toBe(404);
  }finally{await outsider.close();}

  await page.getByRole('button',{name:'Corrected Front',exact:true}).click();await expect(photos.locator('.box-photo-current img')).toHaveAttribute('src',/processed-image\?display=960$/);
  await page.getByRole('button',{name:'Studio',exact:true}).click();await expect(photos.locator('.box-photo-current img')).toHaveAttribute('src',/studio-image\?display=960$/);
  await photos.getByRole('button',{name:'Show photo 8',exact:true}).click();

  async function swipe(dx:number){await photos.locator('.box-photo-slide').evaluate((el,delta)=>{
    const start={clientX:180,clientY:150},end={clientX:180+delta,clientY:150};
    for(const [type,touches,changedTouches] of [['touchstart',[start],[start]],['touchend',[],[end]]] as const){const event=new Event(type,{bubbles:true});Object.defineProperties(event,{touches:{value:touches},changedTouches:{value:changedTouches}});el.dispatchEvent(event);}
  },dx);}
  await expect(photos.locator('.box-photo-slide')).toHaveCSS('height','240px');
  await swipe(-100);await expect(photos.getByRole('button',{name:'Show photo 1',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(photos.locator('.box-photo-outgoing')).toHaveCount(0);
  await expect(photos.locator('.box-photo-current img')).toHaveCSS('height','240px');
  await swipe(100);await expect(photos.getByRole('button',{name:'Show photo 8',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(photos.locator('.box-photo-outgoing')).toHaveCount(0);
  await photos.screenshot({path:'artifacts/box-photo-gallery-mobile.png'});
  await page.reload();await page.getByTestId('private-copy').first().click();await expect(photos.getByRole('button',{name:'Show photo 8',exact:true})).toBeVisible();
  await expect(photos.getByRole('button',{name:'Delete this photo',exact:true})).toHaveCount(0);
  await photos.getByRole('button',{name:'Show photo 2',exact:true}).click();
  await photos.getByRole('button',{name:'Delete this photo',exact:true}).click();await expect(photos.getByRole('button',{name:'Show photo 8',exact:true})).toHaveCount(0);
  await expect(photos.getByRole('button',{name:'Add photo',exact:true})).toBeEnabled();
  expect(await page.locator('.box-photos').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await expect(page.getByRole('form',{name:'Edit your copy'})).toBeVisible();
  await page.getByLabel('Title',{exact:true}).fill('Gallery regression edited');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('.private-detail-title').click();
  await expect(page.getByRole('form',{name:'Edit your copy'})).toBeVisible();await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Gallery regression edited');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Gallery regression edited',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Delete this copy',exact:true}).click();
  await page.getByRole('button',{name:'Delete copy permanently',exact:true}).click();
  await expect(page.getByTestId('private-copy')).toHaveCount(1);
  await page.reload();await expect(page.getByTestId('private-copy')).toHaveCount(1);
  expect(errors).toEqual([]);
});
