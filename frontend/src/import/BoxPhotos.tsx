import {responsivePhoto} from './imageDelivery';
import {useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {api} from './api';
import './BoxPhotos.css';
type Photo={id:string;image_url:string;original:boolean};
export function BoxPhotos({copyId,title,children,toolbar,caption,showCaption=true,coverUrl}:{copyId:number;title:string;children:ReactNode;toolbar?:ReactNode|((showCover:()=>void)=>ReactNode);caption?:ReactNode;showCaption?:boolean;coverUrl?:string}) {
  const [photos,setPhotos]=useState<Photo[]>([]);const [ready,setReady]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);const [slide,setSlide]=useState(0);const picker=useRef<HTMLInputElement>(null);const gesture=useRef<{x:number;y:number}|null>(null);
  useEffect(()=>{let active=true;void api<{photos:Photo[]}>(`/collection-copies/${copyId}/photos`).then(result=>{if(active){setPhotos(result.photos);setReady(true);setError('');}}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Could not load photos.');});return()=>{active=false;};},[copyId,attempt]);
  const current=photos[slide];
  useEffect(()=>{
    if(photos.length<2)return;
    const connection=(navigator as Navigator&{connection?:{saveData?:boolean;effectiveType?:string}}).connection;
    if(connection?.saveData||connection?.effectiveType==='2g'||connection?.effectiveType==='slow-2g')return;
    const indices=new Set([(slide+1)%photos.length,(slide+photos.length-1)%photos.length]);
    const images:HTMLImageElement[]=[];
    for(const index of indices){const photo=photos[index];const url=photo.original?coverUrl:photo.image_url;if(!url)continue;const image=new Image();const source=responsivePhoto(url);image.decoding='async';image.srcset=source.srcSet;image.src=source.src;images.push(image);}
    return()=>{for(const image of images){image.removeAttribute('srcset');image.removeAttribute('src');}};
  },[photos,slide,coverUrl]);
  const [outgoing,setOutgoing]=useState<{content:ReactNode;direction:number}|null>(null);
  function photoContent(index:number):ReactNode {const photo=photos[index];return !ready||photo?.original?children:photo?<img {...responsivePhoto(photo.image_url)} alt={`Photo ${index+1} of ${title}`} draggable={false}/>:<p className="box-photo-empty">No photos yet.</p>;}
  function navigate(index:number,direction:number){if(index===slide||!photos.length)return;setOutgoing({content:photoContent(slide),direction});setSlide(index);}
  function move(direction:number){if(photos.length)navigate((slide+photos.length+direction)%photos.length,direction);}

  async function change(path:string,method:string,data?:unknown) {
    if(busy)return;setBusy(true);setError('');
    try {const result=await api<{photos:Photo[]}>(`/collection-copies/${copyId}/photos${path}`,method,data);setOutgoing(null);setPhotos(result.photos);setSlide(method==='POST'?Math.max(0,result.photos.length-1):Math.min(slide,Math.max(0,result.photos.length-1)));}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not save photo.');}
    finally{setBusy(false);}
  }
  return <section className="box-photos" aria-label="Puzzle photos">
    {toolbar&&<div className="box-photo-toolbar">{typeof toolbar==='function'?toolbar(()=>{const index=photos.findIndex(photo=>photo.original);if(index>=0){setOutgoing(null);setSlide(index);}}):toolbar}</div>}
    <div className="box-photo-carousel" role="region" aria-roledescription="carousel" aria-label={`${title} photos`} tabIndex={0} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}if(event.key==='ArrowRight'){event.preventDefault();move(1);}}}>
      <div className="box-photo-slide" data-direction={outgoing?.direction===-1?'back':'forward'} role="group" aria-roledescription="slide" aria-label={current?`Photo ${slide+1}`:'Photo gallery'} onTouchStart={event=>{const touch=event.touches[0];gesture.current=event.touches.length===1?{x:touch.clientX,y:touch.clientY}:null;}} onTouchCancel={()=>{gesture.current=null;}} onTouchEnd={event=>{const start=gesture.current;gesture.current=null;const touch=event.changedTouches[0];if(!start||!touch||event.touches.length)return;const dx=touch.clientX-start.x,dy=touch.clientY-start.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3)move(dx<0?1:-1);}}>
        {outgoing&&<div className="box-photo-outgoing" aria-hidden="true" inert>{outgoing.content}</div>}
        <div key={current?.id??'empty'} className={`box-photo-current${outgoing?' is-entering':''}`} onAnimationEnd={()=>setOutgoing(null)}>{photoContent(slide)}</div>
      </div>
      {photos.length>1&&<div className="box-photo-dots" role="group" aria-label="Choose photo">{photos.map((photo,index)=><button key={photo.id} type="button" className="box-photo-dot" aria-label={`Show photo ${index+1}`} aria-pressed={slide===index} onClick={()=>navigate(index,index>slide?1:-1)}><span/></button>)}</div>}
    </div>
    <div className="import-actions box-photo-actions">{current&&!current.original&&<button type="button" disabled={busy||!ready} title="Delete this photo" onClick={()=>current&&void change(`/${current.id}`,'DELETE')}>Delete this photo</button>}<button type="button" disabled={busy||!ready||photos.length>=8} title={photos.length>=8?'Maximum of 8 photos':'Add a photo'} onClick={()=>picker.current?.click()}>Add photo</button></div>
    {caption&&<p className="box-photo-caption" style={{visibility:current?.original&&showCaption?'visible':'hidden'}} aria-hidden={!current?.original||!showCaption}>{caption}</p>}
    <input ref={picker} type="file" hidden aria-label="Choose photo file" accept="image/jpeg,image/png,image/webp" disabled={busy||!ready||photos.length>=8} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file){const data=new FormData();data.append('photo',file);void change('','POST',data);}}}/>
    {busy&&<p role="status">Saving photo…</p>}{error&&<p role="alert">{error}</p>}{!ready&&error&&<button onClick={()=>setAttempt(value=>value+1)}>Retry photos</button>}
  </section>;
}
