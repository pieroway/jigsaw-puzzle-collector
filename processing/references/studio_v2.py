"""Deterministic presentation effects, never a photograph of actual box sides.

Consumes a corrected front without enhancing or reconstructing its artwork.
Transparent, lossless WebP assets can sit on either theme's studio surface.
"""
import io
import math
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

VERSION='studio-preview-v2-size-depth'


def _webp(image):
    output=io.BytesIO()
    image.save(output,format='WEBP',lossless=True,method=4,exact=True)
    return output.getvalue()


def render(source,canvas_size=1000):
    if not isinstance(source,Image.Image):
        raise ValueError('A complete corrected front image is required.')
    w,h=source.size
    if min(w,h)<64 or max(w,h)/min(w,h)>4 or w*h>24_000_000:
        raise ValueError('Front is too small, too elongated or too large for studio presentation. Use the flat image.')
    if not isinstance(canvas_size,int) or not 256<=canvas_size<=1200:
        raise ValueError('Presentation size must be between 256 and 1200 pixels.')
    if 'A' in source.getbands() and source.getchannel('A').getextrema()!=(255,255):
        raise ValueError('Corrected front must be opaque and complete. Use the flat image.')
    front=source.convert('RGB')
    # A virtual pinhole camera preserves rectangular physical proportions before
    # projection. No physical dimensions or genuine side artwork are inferred.
    scale=max(w,h); width=w/scale; height=h/scale
    depth=.105*min(width,height)
    ax,ay,az=map(math.radians,(18,-12,-3))
    rx=np.array([[1,0,0],[0,math.cos(ax),-math.sin(ax)],[0,math.sin(ax),math.cos(ax)]])
    ry=np.array([[math.cos(ay),0,math.sin(ay)],[0,1,0],[-math.sin(ay),0,math.cos(ay)]])
    rz=np.array([[math.cos(az),-math.sin(az),0],[math.sin(az),math.cos(az),0],[0,0,1]])
    rotation=rz@ry@rx
    face=np.array([[-width/2,-height/2,0],[width/2,-height/2,0],[width/2,height/2,0],[-width/2,height/2,0]])
    back=face.copy(); back[:,2]=-depth
    points=np.concatenate([face,back])@rotation.T
    projected=points[:,:2]/(4-points[:,2,None])
    low=projected.min(axis=0); extent=np.ptp(projected,axis=0)
    factor=canvas_size*.935/max(extent)
    projected=(projected-low-extent/2)*factor+canvas_size/2
    face,back=projected[:4],projected[4:]
    size=(canvas_size,canvas_size)
    result=Image.new('RGBA',size)
    silhouette=Image.new('L',size); painter=ImageDraw.Draw(silhouette)
    hull=cv2.convexHull(projected.astype(np.float32)).reshape(-1,2)
    offset=np.array([canvas_size*.006,canvas_size*.010])
    painter.polygon([tuple(p) for p in hull+offset],fill=255)
    # Wide ambient penumbra plus a tight contact layer anchors the box.
    ambient=silhouette.filter(ImageFilter.GaussianBlur(canvas_size*.006)).point(lambda value:round(value*.20))
    contact=Image.new('L',size)
    ImageDraw.Draw(contact).polygon([tuple(p) for p in hull+offset*.15],fill=255)
    contact=contact.filter(ImageFilter.GaussianBlur(canvas_size*.002)).point(lambda value:round(value*.28))
    for alpha in [ambient,contact]:
        shadow=Image.new('RGBA',size,(0,0,0,0)); shadow.putalpha(alpha)
        result=Image.alpha_composite(result,shadow)
    # Unbranded neutral paperboard facets; no invented side text/logos.
    for indexes,start,end in [([1,2,6,5],178,139),([2,3,7,6],164,121)]:
        mask=Image.new('L',size)
        ImageDraw.Draw(mask).polygon([tuple(projected[i]) for i in indexes],fill=255)
        gradient=np.linspace(start,end,canvas_size,dtype=np.uint8)[:,None]
        rgb=np.broadcast_to(gradient[:,:,None],(canvas_size,canvas_size,3)).copy()
        facet=Image.fromarray(rgb).convert('RGBA'); facet.putalpha(mask)
        result=Image.alpha_composite(result,facet)
    transform=cv2.getPerspectiveTransform(np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]]),face.astype(np.float32))
    artwork=cv2.warpPerspective(np.asarray(front),transform,size,flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
    alpha=cv2.warpPerspective(np.full((h,w),255,np.uint8),transform,size,flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    mapped=Image.fromarray(artwork).convert('RGBA'); mapped.putalpha(Image.fromarray(alpha))
    result=Image.alpha_composite(result,mapped)
    # Edge seams live on the simulated sides, never across printed artwork.
    edge=ImageDraw.Draw(result)
    for a,b in [(back[1],back[2]),(back[2],back[3])]:
        edge.line([tuple(a),tuple(b)],fill=(105,103,99,255),width=max(1,canvas_size//900))
    thumbnail=result.copy(); thumbnail.thumbnail((400,400),Image.Resampling.LANCZOS)
    return {'version':VERSION,'presentation':_webp(result),'thumbnail':_webp(thumbnail),
            'source_size':[w,h],'front_corners':face.tolist(),'front_transform':transform.tolist(),
            'simulated_thickness':depth/min(width,height),'box_extent':.935,'scale_increase':.935/.77-1,
            'warnings':['Sides, thickness and shadows are simulated presentation effects; actual box depth is unknown.']}


def composite(image,theme):
    if theme not in ['light','dark']:
        raise ValueError('Choose light or dark presentation surface.')
    top,bottom=((246,242,235),(230,225,216)) if theme=='light' else ((49,49,47),(35,35,34))
    blend=np.linspace(0,1,image.height)[:,None,None]
    colors=(np.array(top)[None,None,:]*(1-blend)+np.array(bottom)[None,None,:]*blend).astype(np.uint8)
    surface=Image.fromarray(np.broadcast_to(colors,(image.height,image.width,3)).copy()).convert('RGBA')
    return Image.alpha_composite(surface,image.convert('RGBA')).convert('RGB')


def render_batch(sources,canvas_size=1000):
    """One image at a time: bounded working set, failures do not stop a batch."""
    for source in sources:
        try:
            yield {'status':'ready',**render(source,canvas_size)}
        except (ValueError,OSError) as error:
            yield {'status':'failed','error':str(error)}
