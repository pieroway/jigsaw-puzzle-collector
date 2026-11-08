// @vitest-environment jsdom
import { afterEach,expect,it,vi } from 'vitest';
import { cleanup,render,screen,within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageReview } from './ImageReview';
import type { ImportItem } from './model';
afterEach(cleanup);
const item:ImportItem={ id:1,batch_id:1,client_key:'photo',filename:'photo.jpg',state:'image_review',image_url:'/before',source_image_url:'/source',processed_image_url:'/after',fields:null,error:null,reviewed:false,linked_edition_id:null,suggestion:null,duplicates:{exact_photo:[],identity:[],editions:[]},preprocessing:{status:'ready',decision:'pending',revision:'v1',corners:[[.1,.1],[.9,.1],[.9,.9],[.1,.9]],confidence:.4,low_confidence:true,requires_review:true,warnings:[],engine:'php-gd'} };
it('shows comparison, low confidence and keyboard-adjustable four corners',async()=>{
  const run=vi.fn(async()=>{}); const user=userEvent.setup(); render(<ImageReview item={item} busy={false} run={run}/>);
  expect(screen.getByText(/Low-confidence corner detection/)).toBeTruthy();
  expect(screen.getByAltText('Before processing: photo.jpg')).toBeTruthy();
  expect(screen.getByAltText('After processing: photo.jpg')).toBeTruthy();
  expect(within(screen.getByRole('group',{name:'Adjust the four corners (%)'})).getAllByRole('spinbutton')).toHaveLength(8);
  screen.getByRole('button',{name:'Top left corner handle'}).focus(); await user.keyboard('{ArrowRight}');
  expect((screen.getByLabelText('Top left X (%)') as HTMLInputElement).value).toBe('11');
  expect(screen.getByRole('button',{name:'Use processed image'}).hasAttribute('disabled')).toBe(true);
  await user.click(screen.getByRole('button',{name:'Apply corners'}));
  expect(run).toHaveBeenCalledWith('prepare',{revision:'v1',corners:[[.11,.1],[.9,.1],[.9,.9],[.1,.9]]});
});
it('keeps failed processing recoverable without accepting a missing result',async()=>{
  const run=vi.fn(async()=>{}); const user=userEvent.setup();
  render(<ImageReview item={{...item,processed_image_url:null,preprocessing:{...item.preprocessing!,status:'failed',error:'Processor unavailable'}}} busy={false} run={run}/>);
  expect(screen.getByRole('alert').textContent).toBe('Processor unavailable');
  expect(screen.queryByText(/Low-confidence corner detection/)).toBeNull();
  expect(screen.queryByText(/boundary score/)).toBeNull();
  expect(screen.getByRole('button',{name:'Use processed image'}).hasAttribute('disabled')).toBe(true);
  await user.click(screen.getByRole('button',{name:'Keep original photo'})); expect(run).toHaveBeenCalledWith('reject',{revision:'v1'});
});
it('flags ambiguous orientation and sends absolute rotations without changing corners',async()=>{
  const run=vi.fn(async()=>{}); const user=userEvent.setup();
  render(<ImageReview item={{...item,preprocessing:{...item.preprocessing!,orientation:{angle:270,source:'ocr',ambiguous:true,reason:'Conflicting text layout'}}}} busy={false} run={run}/>);
  expect(screen.getByText(/Orientation needs review/)).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Rotate Right'}));
  expect(run).toHaveBeenLastCalledWith('prepare',{revision:'v1',corners:item.preprocessing!.corners,rotation:0});
  await user.click(screen.getByRole('button',{name:'Rotate Left'}));
  expect(run).toHaveBeenLastCalledWith('prepare',{revision:'v1',corners:item.preprocessing!.corners,rotation:180});
});
