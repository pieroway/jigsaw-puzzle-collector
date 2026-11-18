import {useState} from 'react';
import {responsivePhoto} from '../import/imageDelivery';

const colors=new Map<string,string>();
/** Alpha-weighted mean: transparent Studio padding must not darken the background. */
export function averagePhotoColor(pixels:ArrayLike<number>):string|undefined {
  let red=0,green=0,blue=0,weight=0;
  for(let index=0;index+3<pixels.length;index+=4){const alpha=pixels[index+3]/255;red+=pixels[index]*alpha;green+=pixels[index+1]*alpha;blue+=pixels[index+2]*alpha;weight+=alpha;}
  return weight?`rgb(${Math.round(red/weight)}, ${Math.round(green/weight)}, ${Math.round(blue/weight)})`:undefined;
}
function photoColor(image:HTMLImageElement):string|undefined {
  if(!image.naturalWidth||!image.naturalHeight)return;
  try {
    const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return;
    context.drawImage(image,0,0,16,16);return averagePhotoColor(context.getImageData(0,0,16,16).data);
  } catch {return;}
}
export function CollectionCover({url,title,studio,background}:{url:string;title:string;studio?:boolean;background?:string}) {
  const [sample,setSample]=useState<{url:string;color?:string}>(()=>({url,color:colors.get(url)}));
  const color=sample.url===url?sample.color:colors.get(url);
  return <div className={`collection-art ${studio?'studio-surface':''}`} data-background={background} style={color?{background:color}:undefined}>
    {url?<img {...responsivePhoto(url)} alt={`Box photo of ${title}`} loading="lazy" onLoad={event=>{
      const next=colors.get(url)??photoColor(event.currentTarget);if(!next)return;
      if(!colors.has(url)&&colors.size>=256)colors.delete(colors.keys().next().value!);
      colors.set(url,next);setSample({url,color:next});
    }}/>:<span>No box photo</span>}
  </div>;
}
