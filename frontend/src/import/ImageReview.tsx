import { useEffect, useState, type PointerEvent } from 'react';
import { type Corners, type ImportItem } from './model';
import {StudioControls} from './StudioControls';

const full: Corners=[[0,0],[1,0],[1,1],[0,1]];
const labels=['Top left','Top right','Bottom right','Bottom left'];
export function ImageReview({ item,busy,run,onDirty=()=>{} }: { item:ImportItem; busy:boolean; run:(action:string,data:object)=>Promise<void>; onDirty?:(dirty:boolean)=>void }) {
  const meta=item.preprocessing;
  const [corners,setCorners]=useState<Corners>(meta?.corners ?? full);
  const [changed,setChanged]=useState(false);
  const [studioDirty,setStudioDirty]=useState(false);
  const [size,setSize]=useState<[number,number]>(meta?.oriented_size ?? [4,3]);
  useEffect(() => { setCorners(meta?.corners ?? full); setChanged(false); onDirty(false); if(meta?.oriented_size) setSize(meta.oriented_size); },[meta?.revision,meta?.decision]);
  const closed=['imported','rejected'].includes(item.state);
  const disabled=busy||closed;
  const cornerDisabled=disabled||studioDirty;
  function change(index:number,axis:number,value:number) {
    if(cornerDisabled||!Number.isFinite(value)) return;
    const next=corners.map(point=>[...point]) as Corners;
    next[index][axis]=Math.min(1,Math.max(0,value)); setCorners(next); setChanged(true); onDirty(true);
  }
  function drag(event:PointerEvent<SVGCircleElement>,index:number) {
    if(cornerDisabled||!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const box=event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const next=corners.map(point=>[...point]) as Corners;
    next[index]=[Math.min(1,Math.max(0,(event.clientX-box.left)/box.width)),Math.min(1,Math.max(0,(event.clientY-box.top)/box.height))];
    setCorners(next); setChanged(true); onDirty(true);
  }
  if(!item.image_url) return null;
  if(!meta) return <div className="image-review"><p>The original is stored privately. Image preparation runs before identification.</p>{!closed&&['needs_review','approved'].includes(item.state)&&<button disabled={busy} onClick={()=>void run('prepare',{})}>Prepare image · starts a new review</button>}</div>;
  return <section className="image-review" aria-label="Photograph processing review">
    <h3>Prepare the box photo</h3>
    <a href={`/api/import-items/${item.id}/original`}>Download untouched original</a>
    {meta.status==='ready'&&meta.low_confidence&&<p role="status" className="duplicate-note">Low-confidence corner detection. Check all four outer corners.</p>}
    {meta.status==='ready'&&<p>{meta.engine==='php-gd'?'Portable processing':meta.engine==='opencv'?'OpenCV processing':'Image processing'} · {meta.manual?'Manually adjusted corners':`${Math.round(meta.confidence*100)}% boundary score (heuristic)`}</p>}
    {meta.warnings.map(warning=><p key={warning}>{warning}</p>)}
    {meta.orientation?.ambiguous&&<p role="status" className="duplicate-note">Orientation needs review. {meta.orientation.reason}</p>}
    {meta.orientation?.low_ocr_confidence&&!meta.orientation.ambiguous&&<p>Low OCR text confidence; the reading direction has a clear leading match.</p>}
    {meta.orientation?.source==='manual'&&<p role="status">Manual orientation saved ({meta.orientation.angle}° clockwise). Reprocessing preserves this correction.</p>}
    {meta.status==='failed'&&<p role="alert" className="import-error">{meta.error}</p>}
    <div className="photo-comparison">
      <figure><figcaption>Before · orientation corrected</figcaption><div className="corner-photo" style={{ aspectRatio:`${size[0]} / ${size[1]}` }}>
        <img src={item.source_image_url ?? item.image_url} alt={`Before processing: ${item.filename}`} onLoad={e=>setSize([e.currentTarget.naturalWidth,e.currentTarget.naturalHeight])}/>
        {!closed&&<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="Box boundary">
          <polygon points={corners.map(p=>`${p[0]*1000},${p[1]*1000}`).join(' ')} />
          {corners.map((p,index)=><circle key={index} cx={p[0]*1000} cy={p[1]*1000} r="22" role="button" tabIndex={disabled?-1:0} aria-label={`${labels[index]} corner handle`} onPointerDown={e=>{ if(!disabled) e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e=>drag(e,index)} onPointerUp={e=>{ if(e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} onKeyDown={e=>{ if(!disabled&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) { e.preventDefault(); const axis=e.key==='ArrowLeft'||e.key==='ArrowRight'?0:1; change(index,axis,p[axis]+(e.key==='ArrowLeft'||e.key==='ArrowUp'?-.01:.01)); } }} />)}
        </svg>}
      </div></figure>
      <figure><figcaption>After · proposed catalogue image</figcaption>{item.processed_image_url?<img src={item.processed_image_url} alt={`After processing: ${item.filename}`} />:<p>No processed proposal available.</p>}</figure>
    </div>
    {!closed&&<>
      <StudioControls item={item} disabled={disabled||changed||meta.status!=='ready'} run={run} onDirty={value=>{setStudioDirty(value);onDirty(changed||value);}}/>
      <div className="import-actions" aria-label="Reading orientation"><button disabled={disabled||changed||studioDirty||meta.status!=='ready'} onClick={()=>void run('prepare',{corners:meta.corners,revision:meta.revision,rotation:((meta.orientation?.angle ?? 0)+270)%360})}>Rotate Left</button><button disabled={disabled||changed||studioDirty||meta.status!=='ready'} onClick={()=>void run('prepare',{corners:meta.corners,revision:meta.revision,rotation:((meta.orientation?.angle ?? 0)+90)%360})}>Rotate Right</button></div>
      <fieldset disabled={disabled||studioDirty}><legend>Adjust the four corners (%)</legend><div className="corner-inputs">{corners.map((point,index)=><div key={index}><strong>{labels[index]}</strong>{[0,1].map(axis=><label key={axis}>{axis===0?'X':'Y'}<input aria-label={`${labels[index]} ${axis===0?'X':'Y'} (%)`} type="number" min="0" max="100" step="0.1" value={Math.round(point[axis]*1000)/10} onChange={e=>change(index,axis,Number(e.target.value)/100)} /></label>)}</div>)}</div></fieldset>
      <div className="import-actions"><button disabled={disabled||!changed||studioDirty} onClick={()=>void run('prepare',{ corners,revision:meta.revision })}>Apply corners</button><button disabled={disabled||studioDirty} onClick={()=>void run('prepare',{ revision:meta.revision })}>Detect corners again</button></div>
      {changed&&<p role="status">Apply your corner changes before choosing the image.</p>}
      <div className="import-actions"><button className="primary-action" disabled={disabled||changed||studioDirty||meta.status!=='ready'} onClick={()=>void run('accept',{ revision:meta.revision })}>Use processed image</button><button disabled={disabled||changed||studioDirty} onClick={()=>void run('reject',{ revision:meta.revision })}>Keep original photo</button></div>
    </>}
    <p>{meta.decision==='pending'?'Choose an image before puzzle identification.':meta.decision==='accepted'?'Processed image selected. The original is preserved.':'Original photo selected; proposed crop is not used.'}</p>
  </section>;
}
