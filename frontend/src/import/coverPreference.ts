import {useSyncExternalStore} from 'react';
import type {Copy} from './PrivateCopyDetails';
export type CoverView='studio'|'corrected'|'original';
export type CoverMode=CoverView|'user';
const modeKey='jigsaw-cover-mode',viewsKey='jigsaw-cover-views',eventName='jigsaw:cover-preference';
const validView=(value:unknown):value is CoverView=>value==='studio'||value==='corrected'||value==='original';
function snapshot(){return JSON.stringify([localStorage.getItem(modeKey),localStorage.getItem(viewsKey)]);}
function subscribe(changed:()=>void){window.addEventListener(eventName,changed);window.addEventListener('storage',changed);return()=>{window.removeEventListener(eventName,changed);window.removeEventListener('storage',changed);};}
function readViews(raw:string|null):Record<string,CoverView>{try{const value=JSON.parse(raw??'{}');return value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter(([,view])=>validView(view))) as Record<string,CoverView>:{};}catch{return {};}}
export function useCoverSettings(){const [mode,views]=JSON.parse(useSyncExternalStore(subscribe,snapshot)) as [string|null,string|null];return {mode:(validView(mode)||mode==='user'?mode:'user') as CoverMode,views:readViews(views)};}
export function setCoverMode(mode:CoverMode){localStorage.setItem(modeKey,mode);window.dispatchEvent(new Event(eventName));}
const copyKey=(copy:Copy)=>`${copy.user_id??0}:${copy.id}`;
export function rememberCoverView(copy:Copy,view:CoverView){const views=readViews(localStorage.getItem(viewsKey));views[copyKey(copy)]=view;localStorage.setItem(viewsKey,JSON.stringify(views));window.dispatchEvent(new Event(eventName));}
export function resolveCover(copy:Copy,settings:{mode:CoverMode;views:Record<string,CoverView>}):{view:CoverView;url:string;studio:boolean}{
  const desired=settings.mode==='user'?settings.views[copyKey(copy)]??copy.default_view??(copy.uses_studio?'studio':'original'):settings.mode;
  const urls={studio:copy.studio_image_url,corrected:copy.corrected_image_url,original:copy.original_image_url};
  for(const view of [desired,'corrected','original','studio'] as CoverView[]){if(urls[view])return {view,url:urls[view],studio:view==='studio'};}
  return {view:desired,url:copy.image_url,studio:!!copy.uses_studio};
}
