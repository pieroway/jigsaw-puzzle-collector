import io
import unittest
import numpy as np
from PIL import Image
from studio import render, composite


class StudioTest(unittest.TestCase):
    def test_portrait_landscape_and_square_preserve_projected_proportions(self):
        for size in [(300,500),(500,300),(400,400)]:
            with self.subTest(size=size):
                source=Image.new('RGB',size,(160,80,40))
                result=render(source)
                self.assertEqual(result['source_size'],list(size))
                points=np.asarray(result['front_corners'])
                width=np.linalg.norm(points[1]-points[0])
                height=np.linalg.norm(points[3]-points[0])
                self.assertAlmostEqual(width/height,size[0]/size[1],delta=.12*size[0]/size[1])
                self.assertGreater(result['simulated_thickness'],0)
                self.assertEqual(result['dimensions']['depth_mm'],40)
                self.assertFalse(result['dimensions']['verified'])
                self.assertGreaterEqual(result['scale_increase'],.20)
                self.assertLessEqual(result['scale_increase'],.25)
                rgba=np.asarray(Image.open(io.BytesIO(result['presentation'])))
                for border in [rgba[0,:,3],rgba[-1,:,3],rgba[:,0,3],rgba[:,-1,3]]:
                    self.assertEqual(int(border.max()),0,'Box and visible shadow must fit inside the canvas')

    def test_transparency_shadow_and_theme_do_not_recolor_artwork(self):
        result=render(Image.new('RGB',(400,400),(160,80,40)))
        image=Image.open(io.BytesIO(result['presentation'])).convert('RGBA')
        pixels=np.asarray(image)
        self.assertEqual(int(pixels[0,0,3]),0)
        self.assertTrue(((pixels[:,:,3]>0)&(pixels[:,:,3]<200)).any())
        black_shadow=np.all(pixels[:,:,:3]==0,axis=2)&(pixels[:,:,3]>0)&(pixels[:,:,3]<200)
        self.assertTrue(black_shadow.any(),'Soft shadow must be a separate translucent black layer')
        center=tuple(np.mean(np.asarray(result['front_corners']),axis=0).astype(int))
        light=composite(image,'light'); dark=composite(image,'dark')
        self.assertEqual(light.getpixel(center),dark.getpixel(center))
        self.assertEqual(light.getpixel(center),(160,80,40))
        self.assertNotEqual(light.getpixel((0,0)),dark.getpixel((0,0)))

    def test_depth_presets_actual_dimensions_and_three_quarter_geometry(self):
        from studio import dimensions
        source=Image.new('RGB',(400,300),'white'); side_widths=[]
        for preset,depth in [('thin',25),('standard',40),('deep',55)]:
            result=render(source,400,{'depth':preset})
            self.assertEqual(result['dimensions']['depth_mm'],depth)
            points=np.asarray(result['vertices'])
            side_widths.append(float(np.linalg.norm(points[4]-points[0])))
            self.assertLess(points[4,1],points[0,1],'Top surface must be visible')
            self.assertLess(points[4,0],points[0,0],'Left surface must be visible')
        self.assertLess(side_widths[0],side_widths[1]); self.assertLess(side_widths[1],side_widths[2])
        actual=dimensions((400,300),{'dimensions':{'width_mm':320,'height_mm':240,'depth_mm':45}})
        self.assertEqual(actual['depth_mm'],45); self.assertEqual(actual['front_source'],'user-supplied'); self.assertFalse(actual['verified'])
        with self.assertRaises(ValueError): dimensions((400,300),{'dimensions':{'width_mm':320,'height_mm':400}})
        with self.assertRaises(ValueError): dimensions((400,300),{'depth':'unknown'})
        front=render(source,400,{'view':'front'}); points=np.asarray(front['vertices'])
        self.assertAlmostEqual(points[1,1],points[0,1]); self.assertAlmostEqual(points[2,0],points[1,0])

    def test_input_unchanged_deterministic_webp_and_thumbnail(self):
        source=Image.new('RGB',(500,300),(90,120,150)); before=source.tobytes()
        first=render(source); second=render(source)
        self.assertEqual(source.tobytes(),before)
        self.assertEqual(first['presentation'],second['presentation'])
        for name,limit in [('presentation',1200),('thumbnail',400)]:
            with Image.open(io.BytesIO(first[name])) as image:
                self.assertEqual(image.format,'WEBP')
                self.assertLessEqual(max(image.size),limit)
                self.assertIn('A',image.getbands())

    def test_artwork_fiducials_are_mapped_without_inventing_content(self):
        source=Image.new('RGB',(400,400),'white')
        for x,y,color in [(80,80,(230,20,30)),(280,80,(20,210,40)),(280,280,(20,40,230)),(80,280,(240,190,20))]:
            source.paste(color,(x-20,y-20,x+21,y+21))
        result=render(source)
        import cv2
        mapping=np.asarray(result['front_transform'])
        positions=cv2.perspectiveTransform(np.float32([[[80,80],[280,80],[280,280],[80,280]]]),mapping)[0]
        image=Image.open(io.BytesIO(result['presentation'])).convert('RGB')
        for point,color in zip(positions,[(230,20,30),(20,210,40),(20,40,230),(240,190,20)]):
            self.assertEqual(image.getpixel(tuple(np.rint(point).astype(int))),color)

    def test_unsuitable_and_invalid_inputs_fail_actionably(self):
        for source in [Image.new('RGB',(20,20)),Image.new('RGBA',(200,200),(0,0,0,0)),Image.new('RGB',(5000,100))]:
            with self.subTest(size=source.size):
                with self.assertRaises(ValueError): render(source)
        with self.assertRaises(ValueError): render(Image.new('RGB',(200,200)),canvas_size=8000)
        with self.assertRaises(ValueError): composite(Image.new('RGBA',(100,100)),'unknown')

    def test_batch_failure_does_not_prevent_later_images(self):
        from studio import render_batch
        results=list(render_batch([Image.new('RGB',(200,300)),None,Image.new('RGB',(300,200))]))
        self.assertEqual([item['status'] for item in results],['ready','failed','ready'])
        self.assertTrue(results[1]['error'])

    def test_all_ten_real_corrected_fronts_produce_presentation_and_thumbnail(self):
        import hashlib
        from pathlib import Path
        from pipeline import process
        paths=sorted(Path('/fixtures/photos').glob('puzzle-[0-9][0-9].jpg'))
        self.assertEqual(len(paths),10)
        for path in paths:
            with self.subTest(photo=path.name):
                original=path.read_bytes(); digest=hashlib.sha256(original).hexdigest()
                corrected=process(original)
                expected={'puzzle-01.jpg':270,'puzzle-02.jpg':90,'puzzle-03.jpg':270,'puzzle-04.jpg':90,'puzzle-05.jpg':270,'puzzle-06.jpg':90,'puzzle-07.jpg':270,'puzzle-08.jpg':0,'puzzle-09.jpg':0,'puzzle-10.jpg':270}
                orientation=corrected['orientation']
                self.assertEqual(len(orientation['candidates']),4)
                self.assertTrue(orientation['angle']==expected[path.name] or orientation['ambiguous'],'A wrong unflagged reading orientation is not acceptable')
                if path.name in ['puzzle-08.jpg','puzzle-09.jpg']:
                    self.assertEqual(orientation['angle'],0,'Decorative titles with close OCR rankings must retain upright originals')
                with Image.open(io.BytesIO(corrected['catalogue'])) as source:
                    before=source.tobytes(); result=render(source,512)
                    self.assertEqual(source.tobytes(),before)
                for name in ['presentation','thumbnail']:
                    with Image.open(io.BytesIO(result[name])) as image:
                        self.assertEqual(image.mode,'RGBA')
                        self.assertGreater(image.getchannel('A').getextrema()[1],0)
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),digest)

    def test_six_hundred_presentations_stream_without_a_batch_limit(self):
        from studio import render_batch
        source=Image.new('RGB',(64,96),(80,100,120))
        count=0
        for result in render_batch((source for _ in range(600)),canvas_size=256):
            self.assertEqual(result['status'],'ready')
            self.assertTrue(result['thumbnail'])
            count+=1
        self.assertEqual(count,600)

if __name__=='__main__': unittest.main()
