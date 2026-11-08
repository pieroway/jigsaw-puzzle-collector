import hashlib
import io
import json
import unittest
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from pipeline import process, validate_corners, rectify, enhance, detect_corners

FIXTURES = Path('/fixtures/photos')

class PipelineTest(unittest.TestCase):
    def test_iphone_mpo_jpeg_uses_only_primary_frame_and_preserves_original(self):
        primary=Image.new('RGB',(5712,4284),(180,60,30))
        auxiliary=Image.new('RGB',(200,150),(30,60,180))
        stream=io.BytesIO()
        primary.save(stream,format='MPO',save_all=True,append_images=[auxiliary])
        primary.close(); auxiliary.close()
        data=stream.getvalue(); before=hashlib.sha256(data).hexdigest()
        with Image.open(io.BytesIO(data)) as image:
            self.assertEqual(image.format,'MPO')
            self.assertEqual(image.n_frames,2)
        result=process(data,[[0,0],[1,0],[1,1],[0,1]],0)
        self.assertEqual(result['oriented_size'],[5712,4284])
        self.assertEqual(hashlib.sha256(data).hexdigest(),before)
        for field in ['source','catalogue','thumbnail']:
            with Image.open(io.BytesIO(result[field])) as image:
                self.assertEqual(image.format,'JPEG')
                red,_,blue=image.convert('RGB').getpixel((image.width//2,image.height//2))
                self.assertGreater(red,blue,'Auxiliary blue image must not replace the primary red photograph')

    def test_iphone_24mp_photo_and_25mp_boundary_are_supported(self):
        for size in [(5712,4284),(5000,5000)]:
            with self.subTest(size=size):
                stream=io.BytesIO()
                image=Image.new('RGB',size,'white')
                image.save(stream,format='JPEG'); image.close()
                result=process(stream.getvalue(),[[0,0],[1,0],[1,1],[0,1]],0)
                self.assertEqual(result['oriented_size'],list(size))
                self.assertLessEqual(max(result['catalogue_size']),1600)
                self.assertLessEqual(max(result['thumbnail_size']),400)

    def test_above_25mp_is_rejected_before_processing(self):
        stream=io.BytesIO()
        image=Image.new('RGB',(5001,5000),'white')
        image.save(stream,format='JPEG'); image.close()
        with self.assertRaisesRegex(ValueError,'Unsupported photo or dimensions'):
            process(stream.getvalue())

    def test_ten_real_photos_preserve_originals_and_produce_bounded_images(self):
        for path in sorted(FIXTURES.glob('puzzle-[0-9][0-9].jpg')):
            with self.subTest(photo=path.name):
                before=hashlib.sha256(path.read_bytes()).hexdigest()
                result=process(path.read_bytes())
                self.assertEqual(before, hashlib.sha256(path.read_bytes()).hexdigest())
                self.assertEqual(len(result['corners']),4)
                validate_corners(result['corners'])
                self.assertLessEqual(max(result['catalogue_size']),1600)
                self.assertLessEqual(max(result['thumbnail_size']),400)
                self.assertLess(result['crop_fraction'],.95)
                self.assertGreater(result['crop_fraction'],.2)
                self.assertEqual(result['engine'],'opencv')
                annotations=json.loads(Path(__file__).with_name('corners.json').read_text())
                self.assertLess(float(np.max(np.linalg.norm(np.asarray(result['corners'])-np.asarray(annotations[path.name]),axis=1))),.05,'Outer corners must match the independently reviewed photograph annotations')
                for field in ['catalogue','thumbnail','source']:
                    with Image.open(io.BytesIO(result[field])) as image:
                        self.assertEqual(image.format,'JPEG')
                        self.assertFalse(image.getexif())

    def test_corner_detection_finds_the_outer_rectangle_not_inner_art(self):
        image=np.full((600,800,3),(45,75,100),np.uint8)
        quad=np.array([[120,70],[695,110],[640,530],[90,480]],np.int32)
        cv2.fillConvexPoly(image,quad,(225,225,225))
        cv2.rectangle(image,(200,180),(580,420),(20,80,190),-1)
        corners,confidence,_=detect_corners(image)
        expected=quad/np.array([799,599])
        self.assertLess(float(np.max(np.linalg.norm(np.array(corners)-expected,axis=1))),.04)
        self.assertGreater(confidence,.65)

    def test_four_point_homography_removes_skew(self):
        image=np.zeros((200,300,3),np.uint8)
        quad=np.array([[40,20],[250,40],[270,180],[20,160]],np.float32)
        cv2.fillConvexPoly(image,quad.astype(np.int32),(180,190,200))
        result=rectify(image,(quad/np.array([299,199])).tolist())
        self.assertGreater(float(np.mean(result[4:-4,4:-4])),175)
        self.assertLess(float(np.std(result[4:-4,4:-4,0])),5)

    def test_exif_orientation_precedes_manual_corner_coordinates(self):
        image=Image.new('RGB',(300,180),'white')
        exif=Image.Exif(); exif[274]=6
        stream=io.BytesIO(); image.save(stream,format='JPEG',exif=exif)
        result=process(stream.getvalue(),[[.05,.05],[.95,.05],[.95,.95],[.05,.95]])
        self.assertEqual(result['oriented_size'],[180,300])
        self.assertGreater(result['catalogue_size'][1],result['catalogue_size'][0])

    def test_skewed_real_photo_manual_corners_rectify_the_box(self):
        image=cv2.imread(str(FIXTURES/'puzzle-01.jpg'))
        image=cv2.resize(image,(800,600))
        source=np.float32([[0,0],[799,0],[799,599],[0,599]])
        target=np.float32([[90,30],[720,100],[780,550],[35,580]])
        transform=cv2.getPerspectiveTransform(source,target)
        skewed=cv2.warpPerspective(image,transform,(800,600))
        annotated=np.float32(json.loads(Path(__file__).with_name('corners.json').read_text())['puzzle-01.jpg'])
        projected=cv2.perspectiveTransform((annotated*np.float32([799,599]))[None],transform)[0]
        corners=(projected/np.float32([799,599])).tolist()
        ok,data=cv2.imencode('.jpg',skewed); self.assertTrue(ok)
        result=process(data.tobytes(),corners)
        self.assertGreater(result['crop_fraction'],.2)
        self.assertLess(result['crop_fraction'],.9)
        self.assertEqual(result['corners'],corners)
        self.assertGreater(min(result['catalogue_size']),200)

    def test_poor_lighting_improves_conservatively_and_neutral_colors_stay_neutral(self):
        dark=np.full((160,240,3),35,np.uint8)
        result,settings=enhance(dark)
        self.assertGreater(float(result.mean()),35)
        self.assertLess(float(result.mean()),60)
        self.assertLessEqual(settings['exposure_gain'],1.25)
        self.assertLessEqual(max(settings['white_balance_gains']),1.08)
        neutral=np.full((100,100,3),128,np.uint8)
        corrected,_=enhance(neutral)
        self.assertLessEqual(float(np.max(np.abs(corrected.astype(float)-128))),8)

    def test_rotated_and_dark_real_photos_and_low_confidence_fallback(self):
        image=cv2.imread(str(FIXTURES/'puzzle-01.jpg'))
        for variant in [cv2.rotate(image,cv2.ROTATE_90_CLOCKWISE),np.clip(image*.4,0,255).astype(np.uint8)]:
            ok,data=cv2.imencode('.jpg',variant); self.assertTrue(ok)
            result=process(data.tobytes())
            validate_corners(result['corners'])
            self.assertTrue(result['catalogue'])
        corners,confidence,warnings=detect_corners(np.full((200,300,3),100,np.uint8))
        self.assertLess(confidence,.65); self.assertTrue(warnings)
        self.assertEqual(corners,[[0.,0.],[1.,0.],[1.,1.],[0.,1.]])

    def test_invalid_files_corners_and_extreme_dimensions_fail(self):
        with self.assertRaises(ValueError): process(b'not an image')
        for corners in [[[0,0],[1,1],[1,0],[0,1]],[[0,0]]*4,[[0,0],[2,0],[1,1],[0,1]],[[0,0],[1,0],[1,float('nan')],[0,1]]]:
            with self.subTest(corners=corners):
                with self.assertRaises(ValueError): validate_corners(corners)
        image=Image.new('RGB',(13000,20)); data=io.BytesIO(); image.save(data,format='PNG')
        with self.assertRaises(ValueError): process(data.getvalue())

if __name__=='__main__': unittest.main()
