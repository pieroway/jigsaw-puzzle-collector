"""Deterministic, bounded photographic corrections. No synthesis or artwork reconstruction."""
import io
import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from orientation import orient

VERSION = 'opencv-photo-v3.1-packaging'
MAX_BYTES = 12 * 1024 * 1024

def validate_corners(corners):
    try:
        points=np.asarray(corners,dtype=np.float64)
        if points.shape!=(4,2) or not np.isfinite(points).all() or (points<0).any() or (points>1).any():
            raise ValueError('Four finite normalized corners are required')
        edges=np.roll(points,-1,axis=0)-points
        crosses=edges[:,0]*np.roll(edges,-1,axis=0)[:,1]-edges[:,1]*np.roll(edges,-1,axis=0)[:,0]
        area=.5*float(np.sum(points[:,0]*np.roll(points,-1,axis=0)[:,1]-points[:,1]*np.roll(points,-1,axis=0)[:,0]))
        if (crosses<=.0001).any() or area<.02 or np.min(np.linalg.norm(edges,axis=1))<.03:
            raise ValueError('Corners must form a clockwise convex box, top-left first, covering at least 2% of the image')
        return points.astype(np.float32)
    except (TypeError,OverflowError) as error:
        raise ValueError('Invalid corners') from error

def order_corners(points):
    points=np.asarray(points,dtype=np.float32).reshape(4,2)
    center=points.mean(axis=0)
    points=points[np.argsort(np.arctan2(points[:,1]-center[1],points[:,0]-center[0]))]
    return np.roll(points,-int(np.argmin(points.sum(axis=1))),axis=0)

def detect_corners(image):
    height,width=image.shape[:2]
    scale=min(1.,900/max(height,width))
    small=cv2.resize(image,(round(width*scale),round(height*scale)))
    h,w=small.shape[:2]
    gray=cv2.GaussianBlur(cv2.cvtColor(small,cv2.COLOR_BGR2GRAY),(5,5),0)
    masks=[]
    for low,high in [(25,75),(50,150),(80,200)]:
        edges=cv2.Canny(gray,low,high)
        masks.append(cv2.morphologyEx(edges,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8)))
    # A second proposal source separates boxes from the table using border colour.
    lab=cv2.cvtColor(small,cv2.COLOR_BGR2LAB).astype(np.float32)
    border=np.concatenate([lab[:max(1,h//30)].reshape(-1,3),lab[-max(1,h//30):].reshape(-1,3),lab[:,:max(1,w//30)].reshape(-1,3),lab[:,-max(1,w//30):].reshape(-1,3)])
    background=np.median(border,axis=0)
    distance=np.linalg.norm(lab-background,axis=2)
    for threshold in [25,40,60]:
        mask=(distance>threshold).astype(np.uint8)*255
        mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((11,11),np.uint8))
        masks.append(mask)
    # Classical foreground/background segmentation helps when lid colours blend into the table.
    segmentation=np.full((h,w),cv2.GC_PR_BGD,np.uint8)
    segmentation[max(2,h//25):h-max(2,h//25),max(2,w//10):w-max(2,w//10)]=cv2.GC_PR_FGD
    segmentation[h*9//20:h*11//20,w*9//20:w*11//20]=cv2.GC_FGD
    segmentation[:2]=cv2.GC_BGD; segmentation[-2:]=cv2.GC_BGD; segmentation[:,:2]=cv2.GC_BGD; segmentation[:,-2:]=cv2.GC_BGD
    cv2.setRNGSeed(0)
    cv2.grabCut(small,segmentation,None,np.zeros((1,65),np.float64),np.zeros((1,65),np.float64),2,cv2.GC_INIT_WITH_MASK)
    foreground=np.where((segmentation==cv2.GC_FGD)|(segmentation==cv2.GC_PR_FGD),255,0).astype(np.uint8)
    masks.append(cv2.morphologyEx(foreground,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8)))
    best=None
    for mask in masks:
        contours,_=cv2.findContours(mask,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
        for contour in sorted(contours,key=cv2.contourArea,reverse=True)[:50]:
            perimeter=cv2.arcLength(contour,True)
            for epsilon in [.012,.02,.035]:
                quad=cv2.approxPolyDP(contour,epsilon*perimeter,True)
                if len(quad)!=4 or not cv2.isContourConvex(quad): continue
                points=order_corners(quad)
                normalized=points/np.array([max(1,w-1),max(1,h-1)])
                try: validate_corners(normalized)
                except ValueError: continue
                area=abs(cv2.contourArea(points))/(w*h)
                if not .15<area<.94: continue
                if (normalized<=.001).any() or (normalized>=.999).any(): continue
                if np.count_nonzero((normalized<.01).any(axis=1)|(normalized>.99).any(axis=1))>=2: continue
                edge_mask=np.zeros((h,w),np.uint8)
                cv2.polylines(edge_mask,[points.astype(np.int32)],True,255,3)
                gradient=cv2.magnitude(cv2.Sobel(gray,cv2.CV_32F,1,0),cv2.Sobel(gray,cv2.CV_32F,0,1))
                strength=min(1.,float(np.mean(gradient[edge_mask>0]))/100)
                # Largest supported contour is favoured over printed artwork inside the lid.
                lengths=np.linalg.norm(np.roll(points,-1,axis=0)-points,axis=1)
                imbalance=max(max(lengths[0],lengths[2])/max(1.,min(lengths[0],lengths[2])),max(lengths[1],lengths[3])/max(1.,min(lengths[1],lengths[3])))
                coherence=min(1.,1.15/imbalance)
                score=area*(.7+.3*strength)*coherence
                confidence=min(.92,.5+.3*strength+.15*min(1.,area/.5))*coherence
                if best is None or score>best[0]: best=(score,normalized.tolist(),confidence)
    if best is None:
        return [[0.,0.],[1.,0.],[1.,1.],[0.,1.]],0.,['No reliable outer boundary found. Adjust all four corners.']
    return best[1],round(best[2],3),([] if best[2]>=.65 else ['Low-confidence boundary. Check every corner.'])

def rectify(image,corners):
    points=validate_corners(corners)*np.array([image.shape[1]-1,image.shape[0]-1],np.float32)
    width=max(np.linalg.norm(points[1]-points[0]),np.linalg.norm(points[2]-points[3]))
    height=max(np.linalg.norm(points[3]-points[0]),np.linalg.norm(points[2]-points[1]))
    factor=min(1.,1600/max(width,height))
    width=max(16,round(width*factor)); height=max(16,round(height*factor))
    destination=np.float32([[0,0],[width-1,0],[width-1,height-1],[0,height-1]])
    transform=cv2.getPerspectiveTransform(points.astype(np.float32),destination)
    if not np.isfinite(transform).all() or abs(np.linalg.det(transform))<1e-10: raise ValueError('Degenerate perspective transform')
    return cv2.warpPerspective(image,transform,(width,height),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)

def enhance(image):
    values=image.astype(np.float32)
    gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
    spread=values.max(axis=2)-values.min(axis=2)
    neutral=(spread<18)&(gray>60)&(gray<230)
    gains=np.ones(3,np.float32)
    if np.mean(neutral)>.02:
        means=np.mean(values[neutral],axis=0)
        gains=np.clip(np.mean(means)/np.maximum(means,1),.92,1.08)
    exposure=float(np.clip(128/max(1,float(np.median(gray))),.95,1.25))
    adjusted=np.clip((values*gains*exposure-128)*1.03+128,0,255)
    blur=cv2.GaussianBlur(adjusted,(0,0),.8)
    adjusted=np.clip(adjusted+np.clip((adjusted-blur)*.15,-8,8),0,255).astype(np.uint8)
    return adjusted,{'exposure_gain':round(exposure,4),'white_balance_gains':[round(float(x),4) for x in gains],'contrast':1.03,'sharpening':.15}

def jpeg(image,max_side,quality):
    factor=min(1.,max_side/max(image.shape[:2]))
    if factor<1: image=cv2.resize(image,(max(1,round(image.shape[1]*factor)),max(1,round(image.shape[0]*factor))),interpolation=cv2.INTER_AREA)
    buffer=io.BytesIO()
    Image.fromarray(cv2.cvtColor(image,cv2.COLOR_BGR2RGB)).save(buffer,format='JPEG',quality=quality,optimize=True,progressive=True)
    return buffer.getvalue(),[image.shape[1],image.shape[0]]

def process(data,corners=None,rotation=None):
    if not isinstance(data,bytes) or not 0<len(data)<=MAX_BYTES: raise ValueError('Photo must be at most 12 MB')
    try:
        with Image.open(io.BytesIO(data)) as original:
            # iPhone JPEGs may include an MPF directory and be identified as MPO.
            # Use only the primary JPEG frame; never composite auxiliary images.
            if original.format not in ['JPEG','MPO','PNG','WEBP'] or max(original.size)>12000 or original.width*original.height>25000000 or min(original.size)<16: raise ValueError('Unsupported photo or dimensions')
            oriented=ImageOps.exif_transpose(original).convert('RGB')
            oriented_size=list(oriented.size)
            oriented.thumbnail((1600,1600),Image.Resampling.LANCZOS)
            image=cv2.cvtColor(np.array(oriented),cv2.COLOR_RGB2BGR)
    except (UnidentifiedImageError,OSError,Image.DecompressionBombError) as error: raise ValueError('Cannot decode photo') from error
    if corners is None: corners,confidence,warnings=detect_corners(image)
    else: corners=validate_corners(corners).astype(float).tolist(); confidence=1.; warnings=[]
    crop=rectify(image,corners)
    improved,settings=enhance(crop)
    improved,orientation=orient(improved,rotation)
    catalogue,catalogue_size=jpeg(improved,1600,90)
    thumbnail,thumbnail_size=jpeg(improved,400,82)
    source,_=jpeg(image,1600,90)
    return {'corners':corners,'confidence':confidence,'warnings':warnings,'orientation':orientation,'engine':'opencv','version':VERSION,'manual':corners is not None and confidence==1.,'oriented_size':oriented_size,'catalogue_size':catalogue_size,'thumbnail_size':thumbnail_size,'crop_fraction':round(abs(cv2.contourArea(np.asarray(corners,np.float32))),5),'settings':settings,'catalogue':catalogue,'thumbnail':thumbnail,'source':source}
