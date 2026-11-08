import io
import unittest
from unittest.mock import patch
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from orientation import orient, rotate_clockwise


class OrientationTest(unittest.TestCase):
    def test_ocr_quote_characters_cannot_swallow_later_tsv_rows(self):
        from orientation import scan
        from types import SimpleNamespace
        output=b'text\tconf\twidth\theight\n"Puzzle\t92\t120\t30\nSpringbok\t88\t150\t30\n'
        with patch('orientation.subprocess.run',return_value=SimpleNamespace(stdout=output)):
            records=scan(np.full((80,160),255,np.uint8))
        self.assertEqual([row['text'] for row in records],['"Puzzle','Springbok'])
    def test_invalid_exif_does_not_prevent_ocr_orientation(self):
        from pipeline import process
        source=Image.new('RGB',(900,550),'white'); draw=ImageDraw.Draw(source)
        font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',48)
        for y,text in [(35,'Ravensburger Puzzle'),(180,'Beautiful garden flowers'),(330,'1000 pieces jigsaw puzzle')]: draw.text((40,y),text,font=font,fill='black')
        sideways=Image.fromarray(rotate_clockwise(np.asarray(source),90)); exif=Image.Exif(); exif[274]=999
        encoded=io.BytesIO(); sideways.save(encoded,format='JPEG',exif=exif)
        result=process(encoded.getvalue(),[[0,0],[1,0],[1,1],[0,1]])
        self.assertEqual(result['orientation']['angle'],270); self.assertFalse(result['orientation']['ambiguous'])

    def test_upside_down_springbok_recovers_without_filename_rules(self):
        from pathlib import Path
        from pipeline import process
        front=process(Path('/fixtures/photos/puzzle-09.jpg').read_bytes(),rotation=0)['catalogue']
        image=np.asarray(Image.open(io.BytesIO(front)).convert('RGB'))[:,:,::-1]
        result,metadata=orient(rotate_clockwise(image,180))
        self.assertEqual(metadata['angle'],180)
        self.assertFalse(metadata['ambiguous'])
        np.testing.assert_array_equal(result,image)

    def test_low_text_confidence_does_not_force_orientation_review(self):
        from orientation import choose
        candidates=[{'angle':a,'score':30 if a==90 else 2,'words':4,'letters':22,'mean_confidence':56} for a in [0,90,180,270]]
        result=choose(candidates)
        self.assertTrue(result['low_ocr_confidence'])
        self.assertFalse(result['ambiguous']); self.assertEqual(result['angle'],90)
    def test_real_ocr_reads_sideways_text_without_exif(self):
        image=Image.new('RGB',(900,550),'white')
        font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',48)
        draw=ImageDraw.Draw(image)
        for y,text in [(35,'PUZZLE COLLECTION'),(180,'Beautiful garden flowers'),(330,'1000 pieces for everyone')]:
            draw.text((40,y),text,font=font,fill='black')
        for angle in [0,90,180,270]:
            with self.subTest(angle=angle):
                sideways=rotate_clockwise(np.asarray(image),angle)
                corrected,metadata=orient(sideways)
                self.assertEqual(metadata['angle'],(-angle)%360)
                self.assertFalse(metadata['ambiguous'])
                self.assertEqual(len(metadata['candidates']),4)
                np.testing.assert_array_equal(corrected,np.asarray(image))

    def test_decorative_or_missing_text_is_flagged_and_ocr_failure_is_safe(self):
        image=np.full((160,240,3),100,np.uint8)
        _,metadata=orient(image)
        self.assertTrue(metadata['ambiguous'])
        from orientation import choose
        ambiguous=choose([{'angle':a,'score':10,'words':2,'mean_confidence':70,'letters':8} for a in [0,90,180,270]])
        self.assertTrue(ambiguous['ambiguous'])
        close=choose([{'angle':a,'score':11 if a==180 else 10,'words':4,'mean_confidence':70,'letters':20} for a in [0,90,180,270]])
        self.assertEqual(close['suggested_angle'],180)
        self.assertEqual(close['angle'],0,'Close rankings must not turn an upright photo upside down')
        with patch('orientation.recognize',side_effect=RuntimeError('OCR unavailable')):
            _,failed=orient(np.tile(np.arange(240,dtype=np.uint8),(160,1))[:,:,None].repeat(3,axis=2))
        self.assertTrue(failed['ambiguous']); self.assertEqual(failed['angle'],0)
        self.assertEqual(len(failed['candidates']),4)

    def test_manual_zero_and_quarter_turns_override_ocr(self):
        image=np.zeros((120,200,3),np.uint8); image[10:30,20:50]=[200,80,30]
        for angle in [0,90,180,270]:
            with patch('orientation.recognize',side_effect=AssertionError('Manual decision must not invoke OCR')):
                result,metadata=orient(image,angle)
            self.assertEqual(metadata['source'],'manual'); self.assertEqual(metadata['angle'],angle)
            self.assertFalse(metadata['ambiguous'])
            np.testing.assert_array_equal(result,rotate_clockwise(image,angle))
        for bad in [45,-90,360,True,'90']:
            with self.assertRaises(ValueError): orient(image,bad)

    def test_catalogue_thumbnail_and_studio_use_the_same_manual_orientation(self):
        from pipeline import process
        from studio import render
        image=Image.new('RGB',(300,180),'white'); stream=io.BytesIO(); image.save(stream,format='JPEG')
        result=process(stream.getvalue(),[[.05,.05],[.95,.05],[.95,.95],[.05,.95]],rotation=90)
        self.assertEqual(result['orientation']['angle'],90)
        self.assertGreater(result['catalogue_size'][1],result['catalogue_size'][0])
        self.assertGreater(result['thumbnail_size'][1],result['thumbnail_size'][0])
        with Image.open(io.BytesIO(result['catalogue'])) as source:
            presentation=render(source,256)
            self.assertEqual(presentation['source_size'],result['catalogue_size'])

if __name__=='__main__': unittest.main()
