// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {CopyEditor} from './CopyEditor';
import type {Copy} from './PrivateCopyDetails';
import {api} from './api';
import {allowNavigation} from '../navigation';
vi.mock('./api',()=>({api:vi.fn()}));
const copy={id:7,edition_id:3,title:'Garden Birds',manufacturer:'Maker',piece_count:500,sku:null,release_year:null,edit_revision:1,box_condition:null,seal_status:null,completeness:null,storage_location:null,notes:null} as Copy;
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(window,'confirm').mockReturnValue(false);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('saves only changed fields with the loaded revision and clears optional values',async()=>{
  const onSaved=vi.fn();vi.mocked(api).mockResolvedValue({copy:{...copy,title:'Birds',manufacturer:null,notes:'My shelf',edit_revision:2}});
  const user=userEvent.setup();render(<CopyEditor copy={copy} onSaved={onSaved} onCancel={vi.fn()}/>);
  await user.clear(screen.getByLabelText('Title'));await user.type(screen.getByLabelText('Title'),'Birds');
  await user.clear(screen.getByLabelText('Manufacturer'));await user.type(screen.getByLabelText('Notes'),'My shelf');
  await user.click(screen.getByRole('button',{name:'Save changes'}));
  expect(api).toHaveBeenCalledWith('/collection-copies/7','PATCH',{revision:1,fields:{title:'Birds',manufacturer:null,notes:'My shelf'}});expect(onSaved).toHaveBeenCalledOnce();
});
it('shows field errors without sending an invalid title and Cancel leaves the saved copy alone',async()=>{
  const onCancel=vi.fn();const user=userEvent.setup();render(<CopyEditor copy={copy} onSaved={vi.fn()} onCancel={onCancel}/>);
  await user.clear(screen.getByLabelText('Title'));await user.click(screen.getByRole('button',{name:'Save changes'}));
  expect(screen.getByText('Enter a title.')).toBeTruthy();expect(api).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button',{name:'Cancel'}));expect(onCancel).toHaveBeenCalledOnce();expect(copy.title).toBe('Garden Birds');
});
it('protects dirty navigation and preserves drafts on failed or stale saves',async()=>{
  vi.mocked(api).mockRejectedValue(Object.assign(new Error('Changed on another device.'),{status:409}));
  const user=userEvent.setup();render(<CopyEditor copy={copy} onSaved={vi.fn()} onCancel={vi.fn()}/>);
  await user.type(screen.getByLabelText('Storage location'),'Shelf 2');expect(allowNavigation()).toBe(false);
  await user.click(screen.getByRole('button',{name:'Save changes'}));
  expect((screen.getByLabelText('Storage location') as HTMLInputElement).value).toBe('Shelf 2');
  expect((await screen.findByRole('alert')).textContent).toContain('Changed on another device');
  expect(screen.getByRole('button',{name:'Load latest saved values'})).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Load latest saved values'}));expect(api).toHaveBeenCalledTimes(1);
  vi.mocked(window.confirm).mockReturnValue(true);vi.mocked(api).mockResolvedValue({copy:{...copy,edit_revision:3,storage_location:'Latest shelf'}});
  await user.click(screen.getByRole('button',{name:'Load latest saved values'}));
  expect((screen.getByLabelText('Storage location') as HTMLInputElement).value).toBe('Latest shelf');
  await user.type(screen.getByLabelText('Notes'),'New note');await user.click(screen.getByRole('button',{name:'Save changes'}));
  expect(api).toHaveBeenLastCalledWith('/collection-copies/7','PATCH',{revision:3,fields:{notes:'New note'}});
});
it('blocks leaving and repeated submissions during a save and warns before closing the browser',async()=>{
  let finish!:(value:unknown)=>void;vi.mocked(api).mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  const user=userEvent.setup();render(<CopyEditor copy={copy} onSaved={vi.fn()} onCancel={vi.fn()}/>);
  await user.type(screen.getByLabelText('Notes'),'Private draft');
  const closing=new Event('beforeunload',{cancelable:true});window.dispatchEvent(closing);expect(closing.defaultPrevented).toBe(true);
  await user.click(screen.getByRole('button',{name:'Save changes'}));expect(allowNavigation()).toBe(false);
  expect(screen.getByRole('button',{name:'Saving…'}).hasAttribute('disabled')).toBe(true);expect(screen.getByRole('button',{name:'Cancel'}).hasAttribute('disabled')).toBe(true);
  expect(api).toHaveBeenCalledTimes(1);await act(async()=>finish({copy:{...copy,notes:'Private draft',edit_revision:2}}));
});
