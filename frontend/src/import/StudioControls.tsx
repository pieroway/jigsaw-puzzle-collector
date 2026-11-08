import {useEffect,useState} from 'react';
import type {ImportItem,StudioSettings} from './model';
const defaults:StudioSettings={depth:'standard',view:'three-quarter',background:'transparent',enabled:true,dimensions:{}};
export function StudioControls({item,disabled,run,onDirty}:{item:ImportItem;disabled:boolean;run:(action:string,data:object)=>Promise<void>;onDirty:(value:boolean)=>void}) {
  const studio=item.preprocessing?.studio;
  const [settings,setSettings]=useState<StudioSettings>(studio?.settings??defaults);
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{setSettings(studio?.settings??defaults);setDirty(false);onDirty(false);},[item.preprocessing?.revision]);
  function update(value:Partial<StudioSettings>) {setSettings(old=>({...old,...value}));setDirty(true);onDirty(true);}
  return <section className="studio-controls" aria-label="Studio presentation settings">
    <h3>Studio presentation</h3>
    {item.studio_image_url&&<div className="studio-surface" data-background={settings.background}><img src={item.studio_image_url} alt={`Studio presentation of ${item.filename}`}/></div>}
    {studio?.error&&<p role="status">{studio.error}</p>}
    <p>Sides and shadows are simulated. Estimated sizes are not verified product specifications.</p>
    {studio?.dimensions&&<p>{Math.round(studio.dimensions.width_mm)} × {Math.round(studio.dimensions.height_mm)} × {studio.dimensions.depth_mm} mm · front {studio.dimensions.front_source} · depth {studio.dimensions.depth_source}</p>}
    <fieldset disabled={disabled}><legend>Presentation</legend>
      <div className="studio-options">
        <label>Box depth<select aria-label="Box depth" value={settings.depth} onChange={e=>update({depth:e.target.value as StudioSettings['depth']})}><option value="thin">Thin · 25 mm</option><option value="standard">Standard · 40 mm</option><option value="deep">Deep · 55 mm</option></select></label>
        <label>Viewing angle<select aria-label="Viewing angle" value={settings.view} onChange={e=>update({view:e.target.value as StudioSettings['view']})}><option value="front">Front</option><option value="three-quarter">Three-quarter</option></select></label>
        <label>Studio background<select aria-label="Studio background" value={settings.background} onChange={e=>update({background:e.target.value as StudioSettings['background']})}><option value="transparent">Transparent / app theme</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      </div>
      <label className="review-check"><input type="checkbox" checked={settings.enabled} onChange={e=>update({enabled:e.target.checked})}/>Use studio presentation in my collection</label>
      <details><summary>Use measured dimensions</summary><p>Enter width and height together, or depth alone. Leave blank to use estimates. Front proportions must match the corrected image.</p><div className="studio-options">{(['width_mm','height_mm','depth_mm'] as const).map(name=><label key={name}>{name.replace('_mm','')} (mm)<input type="number" min="5" max="1500" step="0.1" inputMode="decimal" aria-label={`Measured ${name.replace('_mm','')} (mm)`} value={settings.dimensions[name]??''} onChange={e=>{const dimensions={...settings.dimensions}; if(e.target.value==='') delete dimensions[name]; else dimensions[name]=Number(e.target.value);update({dimensions});}}/></label>)}</div></details>
    </fieldset>
    <div className="import-actions"><button disabled={disabled||(!dirty&&studio?.status==='ready')} onClick={()=>void run('studio',{settings,revision:item.preprocessing?.revision})}>{studio?.status==='ready'?'Apply presentation':'Generate studio presentation'}</button></div>
  </section>;
}
