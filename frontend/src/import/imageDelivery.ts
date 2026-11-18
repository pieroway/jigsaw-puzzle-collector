/** Density candidates suit the fixed 240px photo gallery, without fetching original uploads. */
export function displayPhoto(url:string,size=960):string {
  return `${url}${url.includes('?')?'&':'?'}display=${size}`;
}
export function responsivePhoto(url:string) {
  return {src:displayPhoto(url),srcSet:[480,960,1440].map((size,index)=>`${displayPhoto(url,size)} ${index+1}x`).join(', '),decoding:'async' as const};
}
