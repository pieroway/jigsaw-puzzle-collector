"""Review proof only: does not alter importer records or collection images."""
import hashlib
import io
import json
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
from pipeline import process, VERSION as PIPELINE_VERSION
from studio import render, composite, VERSION, CONFIG
from references.studio_v2 import render as previous_render

ROOT=Path('/artifacts/studio')
PHOTOS=Path('/fixtures/photos')


def generate(rotations=()):
    ROOT.mkdir(parents=True,exist_ok=True)
    paths=sorted(PHOTOS.glob('puzzle-[0-9][0-9].jpg'))
    if len(paths)!=10:
        raise ValueError('This review proof requires exactly ten sample photographs.')
    overrides_path=ROOT/'orientation-overrides.json'
    overrides=json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
    for correction in rotations:
        name,angle=correction.split(':'); angle=int(angle)
        if name not in [path.stem for path in paths] or angle not in [0,90,180,270]:
            raise ValueError('Use --rotate puzzle-01:90 with an absolute clockwise quarter-turn.')
        overrides[name]=angle
    if any(name not in [path.stem for path in paths] or type(angle) is not int or angle not in [0,90,180,270] for name,angle in overrides.items()):
        raise ValueError('Invalid saved orientation override')
    if rotations: overrides_path.write_text(json.dumps(overrides,indent=2))
    width,row_height=2560,570
    sheet=Image.new('RGB',(width,len(paths)*row_height),(244,240,233))
    themes=sheet.copy()
    painter=ImageDraw.Draw(sheet); font=ImageFont.load_default(size=20)
    manifest=[]
    for index,path in enumerate(paths):
        entry={'photo':path.name,'status':'processing'}
        y=index*row_height
        try:
            original=path.read_bytes(); digest=hashlib.sha256(original).hexdigest()
            folder=ROOT/path.stem; folder.mkdir(exist_ok=True)
            rotation=overrides.get(path.stem)
            signature=hashlib.sha256(f'{digest}:{PIPELINE_VERSION}:{VERSION}:{json.dumps(CONFIG,sort_keys=True)}:1200:{rotation}'.encode()).hexdigest()
            metadata_path=folder/'metadata.json'
            saved=json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
            names=['corrected.jpg','corrected-thumbnail.jpg','presentation.webp','thumbnail.webp','light.jpg','dark.jpg','previous.jpg']
            if saved.get('signature')==signature and all((folder/name).is_file() for name in names):
                entry=saved
            else:
                corrected=process(original,rotation=rotation)
                with Image.open(io.BytesIO(corrected['catalogue'])) as front:
                    previous=previous_render(front,1200)
                    with Image.open(io.BytesIO(previous['presentation'])) as rgba:
                        composite(rgba,'light').save(folder/'previous.jpg',quality=93,subsampling=0,optimize=True)
                    presentation=render(front,1200)
                (folder/'corrected.jpg').write_bytes(corrected['catalogue'])
                (folder/'corrected-thumbnail.jpg').write_bytes(corrected['thumbnail'])
                (folder/'presentation.webp').write_bytes(presentation.pop('presentation'))
                (folder/'thumbnail.webp').write_bytes(presentation.pop('thumbnail'))
                with Image.open(folder/'presentation.webp') as rgba:
                    for theme in ['light','dark']:
                        composite(rgba,theme).save(folder/f'{theme}.jpg',quality=93,subsampling=0,optimize=True)
                entry={**entry,'status':'ready','signature':signature,'original_sha256':digest,
                       'pipeline_version':PIPELINE_VERSION,**presentation,'confidence':corrected['confidence'],
                       'corner_warnings':corrected['warnings'],'orientation':corrected['orientation'],'outputs':{name:str(folder/name) for name in names}}
                metadata_path.write_text(json.dumps(entry,indent=2))
            before=ImageOps.exif_transpose(Image.open(io.BytesIO(original))).convert('RGB')
            for target,views in [(sheet,[('Original (EXIF preview)',None),('Corrected front','corrected.jpg'),('Previous studio','previous.jpg'),('Improved cuboid','light.jpg')]),(themes,[('Original (EXIF preview)',None),('Corrected front','corrected.jpg'),('Studio Light','light.jpg'),('Studio Dark','dark.jpg')])]:
                painter=ImageDraw.Draw(target)
                for column,(label,name) in enumerate(views):
                    image=before.copy() if name is None else Image.open(folder/name)
                    x=column*640; dark=name=='dark.jpg'
                    if dark: painter.rectangle((x,y,x+639,y+row_height-1),fill=(36,36,35))
                    painter.text((x+16,y+12),f'{index+1:02d}  {label}',font=font,fill=(225,222,215) if dark else (58,55,49))
                    if column>0:
                        orientation=entry['orientation']; note=f'{orientation["angle"]} deg / {orientation["source"]}'
                        if orientation['ambiguous']: note+=' / REVIEW ORIENTATION'
                        elif orientation.get('low_ocr_confidence'): note+=' / low text confidence'
                        painter.text((x+16,y+39),note,font=font,fill=(180,110,20) if orientation['ambiguous'] else ((200,197,190) if dark else (75,73,67)))
                    image.thumbnail((608,466),Image.Resampling.LANCZOS)
                    target.paste(image,(x+(640-image.width)//2,y+84+(466-image.height)//2)); image.close()
            before.close()
            for photo,shape in [('puzzle-01','portrait'),('puzzle-02','landscape'),('puzzle-03','square')]:
                if path.stem==photo: (ROOT/f'closeup-{shape}.jpg').write_bytes((folder/'light.jpg').read_bytes())
            if hashlib.sha256(path.read_bytes()).hexdigest()!=digest:
                raise RuntimeError('Original photograph changed unexpectedly.')
        except (ValueError,OSError,RuntimeError) as error:
            entry.update(status='failed',error=str(error))
            painter.text((16,y+70),f'{path.name}: processing failed; see manifest',font=font,fill='red')
        manifest.append(entry)
    sheet.save(ROOT/'studio-contact-sheet.jpg',quality=93,subsampling=0,optimize=True)
    themes.save(ROOT/'studio-themes.jpg',quality=93,subsampling=0,optimize=True)
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2))
    failures=sum(item['status']!='ready' for item in manifest)
    print(f'Generated {len(manifest)-failures}/10 studio presentations: {ROOT}/studio-contact-sheet.jpg')
    print('Orientation review: '+', '.join(item['photo'] for item in manifest if item.get('orientation',{}).get('ambiguous',True)))
    if failures: raise RuntimeError(f'{failures} photographs failed; review manifest.json')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--rotate',action='append',default=[],help='Persist manual absolute clockwise angle, e.g. puzzle-01:90')
    generate(parser.parse_args().rotate)
