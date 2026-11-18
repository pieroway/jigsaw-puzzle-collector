// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {BoxPhotos} from './BoxPhotos';
import {api} from './api';
vi.mock('./api',()=>({api:vi.fn()}));
const call=vi.mocked(api);const original={id:'original',image_url:'/front.jpg',original:true};const back={id:'2',image_url:'/back.jpg',original:false};
beforeEach(()=>call.mockReset());afterEach(cleanup);
it('shows dots and directly uploads without management, names or counts',async()=>{
  call.mockResolvedValueOnce({photos:[original]}).mockResolvedValueOnce({photos:[original,back]});
  render(<BoxPhotos copyId={12} title="Garden"><img src="/front.jpg" alt="Original"/></BoxPhotos>);const user=userEvent.setup();
  await screen.findByRole('button',{name:'Add photo'});expect(screen.queryByRole('button',{name:'Show photo 1'})).toBeNull();expect(screen.queryByText(/Manage photos|of 8/)).toBeNull();expect(screen.queryByRole('textbox')).toBeNull();
  const file=new File(['photo'],'back.jpg',{type:'image/jpeg'});await user.upload(screen.getByLabelText('Choose photo file'),file);
  await screen.findByAltText('Photo 2 of Garden');expect(screen.getByRole('button',{name:'Show photo 2'}).getAttribute('aria-pressed')).toBe('true');
  const [path,method,data]=call.mock.calls[1];expect(path).toBe('/collection-copies/12/photos');expect(method).toBe('POST');expect((data as FormData).has('name')).toBe(false);
});
it('swipes in both directions with wraparound and ignores vertical gestures',async()=>{
  call.mockResolvedValue({photos:[original,back]});render(<BoxPhotos copyId={12} title="Garden"><p>Original view</p></BoxPhotos>);
  await screen.findByRole('button',{name:'Show photo 2'});
  function swipe(x:number,y:number){const slide=screen.getByRole('group',{name:/Photo [12]$/});fireEvent.touchStart(slide,{touches:[{clientX:150,clientY:150}]});fireEvent.touchEnd(slide,{touches:[],changedTouches:[{clientX:x,clientY:y}]});}
  swipe(240,150);expect(screen.getByAltText('Photo 2 of Garden')).toBeTruthy();swipe(50,150);expect(screen.getByText('Original view')).toBeTruthy();
  swipe(150,250);expect(screen.getByText('Original view')).toBeTruthy();swipe(50,150);expect(screen.getByAltText('Photo 2 of Garden')).toBeTruthy();
});
it('protects the cover and deletes only additional photos',async()=>{
  const photos=[original,...Array.from({length:7},(_,i)=>({id:String(i+1),image_url:`/photo${i}.jpg`,original:false}))];call.mockResolvedValueOnce({photos}).mockResolvedValueOnce({photos:photos.slice(0,-1)});
  render(<BoxPhotos copyId={12} title="Garden"><p>Original view</p></BoxPhotos>);const user=userEvent.setup();await screen.findByRole('button',{name:'Show photo 8'});
  expect((screen.getByRole('button',{name:'Add photo'}) as HTMLButtonElement).disabled).toBe(true);expect(screen.queryByRole('button',{name:'Delete this photo'})).toBeNull();await user.click(screen.getByRole('button',{name:'Show photo 8'}));await user.click(screen.getByRole('button',{name:'Delete this photo'}));await screen.findByAltText('Photo 7 of Garden');
  expect(call).toHaveBeenLastCalledWith('/collection-copies/12/photos/7','DELETE',undefined);expect((screen.getByRole('button',{name:'Add photo'}) as HTMLButtonElement).disabled).toBe(false);
});
it('handles an empty gallery and retains the current photo on failed deletion',async()=>{
  call.mockResolvedValueOnce({photos:[back]}).mockRejectedValueOnce(new Error('Try again')).mockResolvedValueOnce({photos:[]});render(<BoxPhotos copyId={12} title="Garden"><p>Original view</p></BoxPhotos>);const user=userEvent.setup();await screen.findByAltText('Photo 1 of Garden');
  await user.click(screen.getByRole('button',{name:'Delete this photo'}));await screen.findByRole('alert');expect(screen.getByAltText('Photo 1 of Garden')).toBeTruthy();await user.click(screen.getByRole('button',{name:'Delete this photo'}));await screen.findByText('No photos yet.');
  expect(screen.queryByRole('button',{name:'Delete this photo'})).toBeNull();
});

it('preloads only adjacent photos with the responsive image candidates',async()=>{
  const preloaded:{src:string;srcset:string;decoding:string;removeAttribute:ReturnType<typeof vi.fn>}[]=[];
  class PreloadImage {src='';srcset='';decoding='';removeAttribute=vi.fn();constructor(){preloaded.push(this);}}
  vi.stubGlobal('Image',PreloadImage);
  try {
    call.mockResolvedValue({photos:[original,back,{id:'3',image_url:'/third.jpg',original:false},{id:'4',image_url:'/last.jpg',original:false}]});
    render(<BoxPhotos copyId={12} title="Garden" coverUrl="/front.jpg"><p>Cover</p></BoxPhotos>);
    await screen.findByRole('button',{name:'Show photo 4'});
    expect(preloaded.map(image=>image.src)).toEqual(['/back.jpg?display=960','/last.jpg?display=960']);
    expect(preloaded[0].srcset).toContain('/back.jpg?display=480 1x');expect(preloaded[0].srcset).toContain('/back.jpg?display=1440 3x');
  } finally {cleanup();vi.unstubAllGlobals();}
});
