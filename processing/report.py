"""Local visual verification artifact; source photos remain untouched."""
import io
import json
from pathlib import Path
from PIL import Image,ImageDraw,ImageOps
from pipeline import process

sheet=Image.new('RGB',(2560,5*540),(30,30,30)); log=[]
for i,path in enumerate(sorted(Path('/fixtures/photos').glob('puzzle-[0-9][0-9].jpg'))):
    result=process(path.read_bytes()); log.append({'photo':path.name,'corners':result['corners'],'confidence':result['confidence']})
    before=ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    after=Image.open(io.BytesIO(result['catalogue']))
    x=(i%2)*1280; y=(i//2)*540
    for column,image in enumerate([before,after]):
        image.thumbnail((620,480)); sheet.paste(image,(x+column*640+(640-image.width)//2,y+40))
    draw=ImageDraw.Draw(sheet)
    draw.text((x+12,y+12),f'{path.name} - Original (EXIF-oriented preview)',fill='white')
    draw.text((x+652,y+12),f'Corrected - boundary score {result["confidence"]:.2f} (heuristic)',fill='white')
Path('/artifacts').mkdir(exist_ok=True)
sheet.save('/artifacts/fixture-preprocessing.jpg',quality=90)
Path('/artifacts/detections.json').write_text(json.dumps(log,indent=2))
