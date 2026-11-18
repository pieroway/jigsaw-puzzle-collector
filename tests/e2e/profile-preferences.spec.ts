import {test,expect} from '@playwright/test';
test('Profile indicators stay animated, match control corners and align across motion settings',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');await page.getByRole('button',{name:'Profile',exact:true}).last().click();
  const appearance=page.getByRole('group',{name:'Appearance'}),cover=page.getByRole('group',{name:'Cover photo'}),motion=page.getByRole('group',{name:'Reduce Motion'});
  async function aligned(group:typeof appearance){await expect.poll(()=>group.evaluate(el=>{const active=el.querySelector('button.active')!;const style=getComputedStyle(el,'::before');const x=new DOMMatrix(style.transform).m41;return Math.abs(el.getBoundingClientRect().left+parseFloat(style.left)+x-active.getBoundingClientRect().left);})).toBeLessThan(1);}
  await appearance.getByRole('button',{name:'Dark',exact:true}).click();await aligned(appearance);expect(await appearance.evaluate(el=>getComputedStyle(el,'::before').transitionProperty)).toBe('transform');
  await cover.getByRole('button',{name:'User selected'}).click();await aligned(cover);await cover.getByRole('button',{name:'Original',exact:true}).click();await aligned(cover);
  await page.getByRole('button',{name:'Compact (test)',exact:true}).click();await aligned(cover);
  expect(await cover.evaluate(el=>getComputedStyle(el,'::before').borderRadius)).toBe(await cover.evaluate(el=>getComputedStyle(el).borderRadius));
  await motion.getByRole('button',{name:'On',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-reduced-motion','true');expect(await cover.evaluate(el=>getComputedStyle(el,'::before').transitionProperty)).toBe('transform');
  await page.emulateMedia({reducedMotion:'reduce'});await motion.getByRole('button',{name:'Off',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-reduced-motion','false');expect(await cover.evaluate(el=>getComputedStyle(el,'::before').transitionProperty)).toBe('transform');
  expect(await cover.evaluate(el=>getComputedStyle(el,'::before').transitionDuration)).toBe('0.36s');
  await motion.getByRole('button',{name:'System',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-reduced-motion','true');expect(await cover.evaluate(el=>getComputedStyle(el,'::before').transitionProperty)).toBe('transform');
});

test('cover preferences apply across collection, Home and details and remember each chosen view',async({page})=>{
  const copy={id:1,user_id:7,edition_id:1,title:'Cover preference fixture',manufacturer:'Maker',piece_count:500,image_url:'/test-images/default',studio_image_url:'/test-images/studio',corrected_image_url:'/test-images/corrected',original_image_url:'/test-images/original',default_view:'studio',uses_studio:true,visibility:'private'};
  await page.route('**/api/session',route=>route.fulfill({json:{user:{id:7,email:'fixture@example.test'},csrf:'fixture'}}));
  await page.route('**/api/collection',route=>route.fulfill({json:{copies:[copy]}}));
  await page.route('**/api/home',route=>route.fulfill({json:{totals:{puzzles:1,manufacturers:1,known_pieces:500},batches:[],recent:[copy]}}));
  await page.route('**/api/collection-copies/1/photos',route=>route.fulfill({json:{photos:[{id:'original',image_url:copy.original_image_url,original:true}]}}));
  await page.route('**/test-images/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="tan"/></svg>'}));
  await page.goto('/');await page.getByRole('button',{name:'Profile',exact:true}).last().click();const setting=()=>page.getByRole('group',{name:'Cover photo'});
  await setting().getByRole('button',{name:'Original',exact:true}).click();await page.getByRole('button',{name:'Collection',exact:true}).last().click();
  await expect(page.getByTestId('private-copy').locator('img')).toHaveAttribute('src','/test-images/original?display=960');
  await page.getByTestId('private-copy').click();await expect(page.getByRole('button',{name:'Original',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Corrected Front',exact:true}).click();await page.locator('.import-detail .back-button').click();
  await expect(page.getByTestId('private-copy').locator('img')).toHaveAttribute('src','/test-images/original?display=960');
  await page.getByRole('button',{name:'Profile',exact:true}).last().click();await setting().getByRole('button',{name:'User selected'}).click();await page.getByRole('button',{name:'Collection',exact:true}).last().click();
  await expect(page.getByTestId('private-copy').locator('img')).toHaveAttribute('src','/test-images/corrected?display=960');await page.getByRole('button',{name:'Home',exact:true}).last().click();
  await expect(page.locator('.home-recent img')).toHaveAttribute('src','/test-images/corrected?display=960');await page.reload();await expect(page.locator('.home-recent img')).toHaveAttribute('src','/test-images/corrected?display=960');
  await page.getByRole('button',{name:/Cover preference fixture/}).click();await expect(page.getByRole('button',{name:'Corrected Front',exact:true})).toHaveAttribute('aria-pressed','true');
});
