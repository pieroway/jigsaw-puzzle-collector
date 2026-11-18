// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {api,session} from './api';
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function stalledFetch(){vi.stubGlobal('fetch',vi.fn((_url:string,options:RequestInit)=>new Promise((_resolve,reject)=>{options.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});})));}
it('times out stalled reads and removes the timer',async()=>{
  stalledFetch();const result=api('/collection').catch(error=>error);await vi.advanceTimersByTimeAsync(15000);const error=await result;
  expect(error).toMatchObject({status:408,message:expect.stringContaining('retry')});expect(vi.getTimerCount()).toBe(0);
});
it('can cancel a superseded read without reporting it as a timeout',async()=>{
  stalledFetch();const controller=new AbortController();const result=api('/collection','GET',undefined,{signal:controller.signal}).catch(error=>error);controller.abort();expect(await result).toMatchObject({name:'AbortError'});expect(vi.getTimerCount()).toBe(0);
});
it('does not impose the read timeout on a mutation',async()=>{
  let finish!:(response:unknown)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise(resolve=>{finish=resolve;})));
  const request=api('/collection-copies/1','PATCH',{revision:1,fields:{title:'Updated'}});expect(vi.getTimerCount()).toBe(0);await vi.advanceTimersByTimeAsync(20000);
  finish({ok:true,json:async()=>({saved:true})});expect(await request).toEqual({saved:true});
});
it('a failed session read can be retried instead of caching its failure',async()=>{
  stalledFetch();const first=session().catch(error=>error);await vi.advanceTimersByTimeAsync(15000);expect((await first).status).toBe(408);
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({user:null,csrf:'retry-token'})}));expect(await session()).toEqual({user:null,csrf:'retry-token'});expect(vi.getTimerCount()).toBe(0);
});
