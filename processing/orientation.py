"""Local OCR proposes an upright quarter-turn; manual decisions always win.

Angles are clockwise relative to the EXIF-oriented, rectified front, not relative
to the last generated derivative. OCR scores are evidence heuristics, not odds.
"""
import csv
import io
import math
import os
import subprocess
import re
from difflib import SequenceMatcher
import cv2
import numpy as np

VERSION='tesseract-packaging-v3.1'
ANGLES=(0,90,180,270)
MANUFACTURERS=('springbok','ravensburger','aquarius','buffalo','ceaco','white mountain')
PACKAGING={'puzzle','puzzles','jigsaw','pieces','piece','pcs','ages','quality','interlocking','assembled','size','years'}


def rotate_clockwise(image,angle):
    if type(angle) is not int or angle not in ANGLES:
        raise ValueError('Rotation must be 0, 90, 180 or 270 clockwise degrees.')
    return np.ascontiguousarray(np.rot90(image,-angle//90))


def recognize(image,angle):
    gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
    factor=min(1.,1100/max(gray.shape))
    if factor<1:
        gray=cv2.resize(gray,None,fx=factor,fy=factor,interpolation=cv2.INTER_AREA)
    # OCR input only: contrast normalization never changes catalogue artwork.
    gray=cv2.normalize(gray,None,0,255,cv2.NORM_MINMAX)
    # Overlapping horizontal bands separate dense artwork from lettering at any
    # height. No logo is assumed to be at a particular location.
    bands=[]
    for start in [0,.3,.6]:
        band=gray[int(gray.shape[0]*start):int(gray.shape[0]*min(1,start+.4))]
        bands.extend([band,np.full((28,gray.shape[1]),255,np.uint8)])
    panels=np.concatenate(bands)
    records=[]
    for view in [gray,panels]:
        records.extend(scan(view))
    # Overlap and full/band scans can recognize the same printed token twice.
    # Keep its strongest reading rather than multiplying supporting evidence.
    unique={}
    for row in records:
        key=re.sub('[^a-z0-9]','',row['text'].lower())
        if key and (key not in unique or row['confidence']>unique[key]['confidence']): unique[key]=row
    words=[]; score=0.; letters=0; confidences=[]; brands=[]; labels=[]
    for key,row in unique.items():
        alpha=sum(c.isalpha() for c in key); confidence=row['confidence']
        brand=next((name for name in MANUFACTURERS if SequenceMatcher(None,key,name.replace(' ','')).ratio()>=(.82 if len(key)>=7 else .92)),None)
        label=key in PACKAGING
        if confidence<30 or (alpha<2 and not key.isdigit()): continue
        if alpha<2:
            # Counts support readable words, never decide orientation alone.
            score+=.1*(confidence/100)**2; continue
        horizontal=min(1.5,max(.5,row['width']/max(1,row['height'])/2))
        weight=.3*math.sqrt(min(alpha,16))*horizontal
        if brand: weight+=14; brands.append(brand)
        if label: weight+=4; labels.append(key)
        score+=weight*(confidence/100)**2
        words.append(row['text'][:40]); letters+=alpha; confidences.append(confidence)
    if 'white' in unique and 'mountain' in unique:
        score+=8; brands.append('white mountain')
    return {'angle':angle,'score':round(score,4),'words':len(words),'letters':letters,
            'mean_confidence':round(float(np.mean(confidences)),2) if confidences else 0.,
            'manufacturers':sorted(set(brands)),'packaging':sorted(set(labels)),'evidence':words[:24]}


def scan(gray):
    ok,encoded=cv2.imencode('.png',gray)
    if not ok: raise ValueError('Cannot prepare OCR input')
    output=subprocess.run(['tesseract','stdin','stdout','-l','eng','--psm','11','tsv'],
                          input=encoded.tobytes(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                          timeout=1.5,check=True,env={**os.environ,'OMP_THREAD_LIMIT':'1'})
    records=[]
    for row in csv.DictReader(io.StringIO(output.stdout.decode('utf-8')),delimiter='\t',quoting=csv.QUOTE_NONE):
        text=row.get('text','').strip()
        confidence=float(row.get('conf',-1))
        if text and confidence>=0: records.append({'text':text,'confidence':confidence,'width':int(row['width']),'height':int(row['height'])})
    return records


def choose(candidates):
    ranked=sorted(candidates,key=lambda item:item['score'],reverse=True)
    best,runner=ranked[:2]
    margin=(best['score']-runner['score'])/max(1.,best['score'])
    ambiguous=(margin<.20 or best['score']<3 or best['words']<2 or best['letters']<8
               or any('error' in item for item in candidates))
    # Close rankings are insufficient evidence to turn an already upright photo
    # upside down. Preserve the rectified orientation and expose the suggestion.
    angle=0 if margin<.20 else best['angle']
    reason='Check reading orientation: OCR evidence is weak, conflicting or incomplete.' if ambiguous else 'Best supported horizontal text layout.'
    if margin<.20: reason+=' Close scores: source reading orientation retained.'
    return {'version':VERSION,'source':'ocr','angle':angle,'suggested_angle':best['angle'],'ambiguous':ambiguous,'low_ocr_confidence':best['mean_confidence']<65,
            'margin':round(margin,4),'candidates':candidates,
            'reason':reason}


def orient(image,rotation=None):
    if rotation is not None:
        return rotate_clockwise(image,rotation),{'version':VERSION,'source':'manual','angle':rotation,
                  'ambiguous':False,'candidates':[],'reason':'Saved manual orientation; OCR cannot overwrite it.'}
    candidates=[]
    for angle in ANGLES:
        candidate=rotate_clockwise(image,angle)
        try:
            if float(np.std(candidate))<2:
                evidence={'angle':angle,'score':0.,'words':0,'letters':0,'mean_confidence':0.,'evidence':[]}
            else: evidence=recognize(candidate,angle)
        except (OSError,ValueError,RuntimeError,subprocess.SubprocessError):
            evidence={'angle':angle,'score':0.,'words':0,'letters':0,'mean_confidence':0.,'error':'OCR could not evaluate this angle.'}
        candidates.append(evidence)
    metadata=choose(candidates)
    # Incomplete scans cannot safely rank angles; keep source orientation visible.
    if any('error' in item for item in candidates): metadata['angle']=0
    return rotate_clockwise(image,metadata['angle']),metadata
