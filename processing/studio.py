"""Deterministic presentation effects, never a photograph of actual box sides.

Consumes a corrected front without enhancing or reconstructing its artwork.
Transparent, lossless WebP assets can sit on either theme's studio surface.
"""
import io
import math
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

VERSION='studio-cuboid-v3.1-standing'
CONFIG=json.loads(Path(__file__).with_name('studio_config.json').read_text())


def dimensions(source_size,settings):
    settings=settings or {}
    if not isinstance(settings,dict): raise ValueError('Studio settings must be an object')
    preset=settings.get('depth','standard'); view=settings.get('view','three-quarter')
    if preset not in CONFIG['depth_presets_mm'] or view not in CONFIG['camera_presets']:
        raise ValueError('Choose Thin/Standard/Deep and Front/Three-quarter')
    supplied=settings.get('dimensions',{})
    if not isinstance(supplied,dict): raise ValueError('Dimensions must be an object')
    actual={}
    for name in ['width_mm','height_mm','depth_mm']:
        value=supplied.get(name)
        if value is not None:
            if type(value) not in [int,float] or not math.isfinite(value) or not 5<=value<=1500:
                raise ValueError('Box dimensions must be finite millimetres between 5 and 1500')
            actual[name]=value
    if ('width_mm' in actual)!=('height_mm' in actual): raise ValueError('Supply both front width and height')
    w,h=source_size
    width=CONFIG['estimated_long_edge_mm']*w/max(w,h); height=CONFIG['estimated_long_edge_mm']*h/max(w,h)
    if 'width_mm' in actual:
        if abs(actual['width_mm']/actual['height_mm']/(w/h)-1)>.02:
            raise ValueError('Measured front proportions differ from the corrected photo. Check dimensions/corners before rendering.')
        # Preserve exact photo aspect: use supplied width as the physical scale.
        # The measured height is retained separately, rather than stretching art.
        width=actual['width_mm']; height=width*h/w
    depth=actual.get('depth_mm',CONFIG['depth_presets_mm'][preset])
    if depth>min(width,height)*.6: raise ValueError('Depth is too large for the supplied front dimensions')
    return {'width_mm':width,'height_mm':height,'depth_mm':depth,'actual_input':actual,
            'front_source':'user-supplied' if 'width_mm' in actual else 'estimated',
            'depth_source':'user-supplied' if 'depth_mm' in actual else 'preset estimate','verified':False}


def _webp(image):
    output=io.BytesIO()
    image.save(output,format='WEBP',lossless=True,method=4,exact=True)
    return output.getvalue()


def render(source,canvas_size=1000,settings=None):
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
    physical=dimensions((w,h),settings)
    # A virtual pinhole camera preserves rectangular physical proportions before
    # projection. No physical dimensions or genuine side artwork are inferred.
    scale=max(physical['width_mm'],physical['height_mm'])
    width=physical['width_mm']/scale; height=physical['height_mm']/scale; depth=physical['depth_mm']/scale
    camera=CONFIG['camera_presets'][(settings or {}).get('view','three-quarter')]
    ax,ay,az=map(math.radians,(camera['pitch_degrees'],camera['yaw_degrees'],camera['roll_degrees']))
    rx=np.array([[1,0,0],[0,math.cos(ax),-math.sin(ax)],[0,math.sin(ax),math.cos(ax)]])
    ry=np.array([[math.cos(ay),0,math.sin(ay)],[0,1,0],[-math.sin(ay),0,math.cos(ay)]])
    rz=np.array([[math.cos(az),-math.sin(az),0],[math.sin(az),math.cos(az),0],[0,0,1]])
    rotation=rz@ry@rx
    face=np.array([[-width/2,-height/2,0],[width/2,-height/2,0],[width/2,height/2,0],[-width/2,height/2,0]])
    back=face.copy(); back[:,2]=-depth
    world=np.concatenate([face,back])
    points=world@rotation.T
    projected=points[:,:2]/(camera['distance_factor']-points[:,2,None])
    low=projected.min(axis=0); extent=np.ptp(projected,axis=0)
    factor=canvas_size*CONFIG['box_extent']/max(extent)
    # Cast onto the ground plane through the bottom of the upright box. This
    # anchors its base instead of outlining the whole front with a card halo.
    ground=world.copy(); fall=height/2-ground[:,1]
    ground[:,0]+=fall*.008; ground[:,2]-=fall*.08; ground[:,1]=height/2
    ground=ground@rotation.T
    ground=ground[:,:2]/(camera['distance_factor']-ground[:,2,None])
    ground=(ground-low-extent/2)*factor+canvas_size/2
    projected=(projected-low-extent/2)*factor+canvas_size/2
    face,back=projected[:4],projected[4:]
    size=(canvas_size,canvas_size)
    result=Image.new('RGBA',size)
    silhouette=Image.new('L',size); painter=ImageDraw.Draw(silhouette)
    hull=cv2.convexHull(ground.astype(np.float32)).reshape(-1,2)
    offset=np.array([canvas_size*.006,canvas_size*.010])
    painter.polygon([tuple(p) for p in hull+offset],fill=255)
    # Wide ambient penumbra plus a tight contact layer anchors the box.
    ambient=silhouette.filter(ImageFilter.GaussianBlur(canvas_size*.006)).point(lambda value:round(value*.20))
    contact=Image.new('L',size)
    base=cv2.convexHull(projected[[2,3,6,7]].astype(np.float32)).reshape(-1,2)
    ImageDraw.Draw(contact).polygon([tuple(p) for p in base+offset*.15],fill=255)
    contact=contact.filter(ImageFilter.GaussianBlur(canvas_size*.002)).point(lambda value:round(value*.28))
    for alpha in [ambient,contact]:
        shadow=Image.new('RGBA',size,(0,0,0,0)); shadow.putalpha(alpha)
        result=Image.alpha_composite(result,shadow)
    # Unbranded neutral paperboard facets; no invented side text/logos.
    edge_pixels=np.concatenate([np.asarray(front)[:4].reshape(-1,3),np.asarray(front)[-4:].reshape(-1,3)])
    tint=np.clip(np.median(edge_pixels,axis=0)-np.median(edge_pixels),-30,30)*CONFIG['edge_tint']
    for indexes,start,end in [([0,3,7,4],173,137),([0,1,5,4],225,195)]:
        mask=Image.new('L',size)
        ImageDraw.Draw(mask).polygon([tuple(projected[i]) for i in indexes],fill=255)
        gradient=np.linspace(start,end,canvas_size,dtype=np.uint8)[:,None]
        rgb=np.clip(np.broadcast_to(gradient[:,:,None],(canvas_size,canvas_size,3))+tint,0,255).astype(np.uint8)
        facet=Image.fromarray(rgb).convert('RGBA'); facet.putalpha(mask)
        result=Image.alpha_composite(result,facet)
    transform=cv2.getPerspectiveTransform(np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]]),face.astype(np.float32))
    artwork=cv2.warpPerspective(np.asarray(front),transform,size,flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
    alpha=cv2.warpPerspective(np.full((h,w),255,np.uint8),transform,size,flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    mapped=Image.fromarray(artwork).convert('RGBA'); mapped.putalpha(Image.fromarray(alpha))
    result=Image.alpha_composite(result,mapped)
    # Edge seams live on the simulated sides, never across printed artwork.
    edge=ImageDraw.Draw(result)
    if back[1,0]>face[1,0]:
        edge.line([tuple(back[1]),tuple(back[2])],fill=(105,103,99,255),width=max(1,canvas_size//900))
    if back[0,0]<face[0,0]:
        edge.line([tuple(back[0]),tuple(back[3])],fill=(105,103,99,255),width=max(1,canvas_size//900))
    if back[0,1]<face[0,1] and back[1,1]<face[1,1]:
        edge.line([tuple(back[0]),tuple(back[1])],fill=(232,230,225,255),width=max(1,canvas_size//650))
    thumbnail=result.copy(); thumbnail.thumbnail((400,400),Image.Resampling.LANCZOS)
    return {'version':VERSION,'presentation':_webp(result),'thumbnail':_webp(thumbnail),
            'source_size':[w,h],'front_corners':face.tolist(),'front_transform':transform.tolist(),
            'simulated_thickness':depth/min(width,height),'box_extent':CONFIG['box_extent'],'scale_increase':CONFIG['box_extent']/.77-1,
            'dimensions':physical,'camera':camera,'vertices':projected.tolist(),
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
