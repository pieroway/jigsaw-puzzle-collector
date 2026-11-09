// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {CopyRemovalNotice} from './CopyRemovalNotice';
import {api} from './api';
vi.mock('./api',()=>({api:vi.fn()}));afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();});
it('floats outside page content and fades after five seconds',()=>{
  vi.useFakeTimers();const {container}=render(<CopyRemovalNotice removal={{copy_id:7}}/>);
  expect(container.textContent).toBe('');const notice=screen.getByRole('status').closest('.copy-removal-notice')!;
  act(()=>vi.advanceTimersByTime(4999));expect(notice.getAttribute('data-phase')).toBe('visible');
  act(()=>vi.advanceTimersByTime(1));expect(notice.getAttribute('data-phase')).toBe('fade');
  act(()=>vi.advanceTimersByTime(550));expect(screen.queryByRole('status')).toBeNull();
});
it('dismisses an upward swipe but ignores a downward gesture',()=>{
  vi.useFakeTimers();render(<CopyRemovalNotice removal={{copy_id:7}}/>);const notice=screen.getByRole('status').closest('.copy-removal-notice')!;
  fireEvent.touchStart(notice,{touches:[{clientY:100}]});fireEvent.touchMove(notice,{touches:[{clientY:160}]});expect(notice.getAttribute('data-phase')).toBe('visible');
  fireEvent.touchStart(notice,{touches:[{clientY:160}]});fireEvent.touchMove(notice,{touches:[{clientY:100}]});expect(notice.getAttribute('data-phase')).toBe('swipe');
  act(()=>vi.advanceTimersByTime(550));expect(screen.queryByRole('status')).toBeNull();
});
it('offers a dismiss button for keyboard users',()=>{
  vi.useFakeTimers();render(<CopyRemovalNotice removal={{copy_id:7}}/>);fireEvent.click(screen.getByRole('button',{name:'Dismiss notification'}));
  act(()=>vi.advanceTimersByTime(550));expect(screen.queryByRole('status')).toBeNull();
});
it('keeps failed photo cleanup retryable after the copy was deleted',async()=>{
  vi.mocked(api).mockRejectedValueOnce(new Error('Storage temporarily unavailable')).mockResolvedValueOnce({cleanup_pending:0});
  const user=userEvent.setup();render(<CopyRemovalNotice removal={{copy_id:7,cleanup_pending:1}}/>);
  await user.click(screen.getByRole('button',{name:'Retry photo cleanup'}));expect((await screen.findByRole('alert')).textContent).toContain('Storage temporarily unavailable');
  await user.click(screen.getByRole('button',{name:'Retry photo cleanup'}));expect(screen.queryByRole('button',{name:'Retry photo cleanup'})).toBeNull();
  expect(api).toHaveBeenLastCalledWith('/import-batches/cleanup','POST');
});
