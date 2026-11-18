import {test,expect} from '@playwright/test';
test('cover backgrounds follow photo colors in grid, list, cover preferences and Home',async({page})=>{
  const copy={id:1,user_id:7,edition_id:1,title:'Color fixture',manufacturer:'Maker',piece_count:500,image_url:'/test-images/original',studio_image_url:'/test-images/studio',original_image_url:'/test-images/original',default_view:'original',uses_studio:false};
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/session',route=>route.fulfill({json:{user:{id:7,email:'fixture@example.test'},csrf:'fixture'}}));
  await page.route('**/api/collection',route=>route.fulfill({json:{copies:[copy]}}));
  await page.route('**/api/home',route=>route.fulfill({json:{totals:{puzzles:1,manufacturers:1,known_pieces:500},batches:[],recent:[copy]}}));
  await page.route('**/test-images/**',route=>route.fulfill({contentType:'image/svg+xml',body:route.request().url().includes('/studio')?'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="16" height="32" fill="#208060"/></svg>':'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="16" height="32" fill="red"/><rect x="16" width="16" height="32" fill="blue"/></svg>'}));
  await page.goto('/');const art=page.locator('.private-grid .collection-art');await expect(art).toHaveCSS('background-color','rgb(128, 0, 128)');
  await page.getByRole('button',{name:'List view',exact:true}).click();await expect(art).toHaveCSS('background-color','rgb(128, 0, 128)');
  await page.getByRole('button',{name:'Profile',exact:true}).last().click();await page.getByRole('group',{name:'Cover photo'}).getByRole('button',{name:'Studio',exact:true}).click();
  await page.getByRole('button',{name:'Collection',exact:true}).last().click();await expect(art).toHaveCSS('background-color','rgb(32, 128, 96)');await expect(art).toHaveCSS('background-image','none');
  await page.getByRole('button',{name:'Home',exact:true}).last().click();await expect(art).toHaveCSS('background-color','rgb(32, 128, 96)');expect(errors).toEqual([]);
});
