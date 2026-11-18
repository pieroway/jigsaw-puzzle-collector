import {expect,it} from 'vitest';
import {averagePhotoColor} from './CollectionCover';
it('averages the visible colors in a cover',()=>{
  expect(averagePhotoColor(new Uint8ClampedArray([255,0,0,255,0,0,255,255]))).toBe('rgb(128, 0, 128)');
});
it('ignores transparent padding and weights translucent pixels',()=>{
  expect(averagePhotoColor(new Uint8ClampedArray([255,0,0,255,0,0,0,0]))).toBe('rgb(255, 0, 0)');
  expect(averagePhotoColor(new Uint8ClampedArray([255,0,0,255,0,0,255,128]))).toBe('rgb(170, 0, 85)');
});
it('keeps the fallback for empty or fully transparent images',()=>{
  expect(averagePhotoColor([])).toBeUndefined();expect(averagePhotoColor([0,0,0,0])).toBeUndefined();
});
