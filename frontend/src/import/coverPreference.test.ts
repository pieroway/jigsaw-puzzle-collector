// @vitest-environment jsdom
import {beforeEach,expect,it} from 'vitest';
import {rememberCoverView,resolveCover} from './coverPreference';
import type {Copy} from './PrivateCopyDetails';
const copy={id:4,user_id:1,image_url:'/default',studio_image_url:'/studio',corrected_image_url:'/corrected',original_image_url:'/original',default_view:'studio'} as Copy;
beforeEach(()=>localStorage.clear());
it('global choices override remembered views and missing versions fall back',()=>{
  const views={'1:4':'corrected' as const};expect(resolveCover(copy,{mode:'original',views}).url).toBe('/original');expect(resolveCover(copy,{mode:'user',views}).url).toBe('/corrected');
  expect(resolveCover({...copy,studio_image_url:null},{mode:'studio',views:{}}).url).toBe('/corrected');
  expect(resolveCover({...copy,studio_image_url:null,corrected_image_url:null},{mode:'studio',views:{}}).url).toBe('/original');
});
it('stores per-copy choices separately for different owners',()=>{
  rememberCoverView(copy,'original');rememberCoverView({...copy,user_id:2},'corrected');
  const views=JSON.parse(localStorage.getItem('jigsaw-cover-views')!);expect(views).toEqual({'1:4':'original','2:4':'corrected'});
  expect(resolveCover(copy,{mode:'user',views}).view).toBe('original');expect(resolveCover({...copy,user_id:2},{mode:'user',views}).view).toBe('corrected');
});
