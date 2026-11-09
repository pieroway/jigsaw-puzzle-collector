// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {CopyRemovalNotice} from './CopyRemovalNotice';
import {api} from './api';
vi.mock('./api',()=>({api:vi.fn()}));afterEach(()=>{cleanup();vi.clearAllMocks();});
it('keeps failed photo cleanup retryable after the copy was deleted',async()=>{
  vi.mocked(api).mockRejectedValueOnce(new Error('Storage temporarily unavailable')).mockResolvedValueOnce({cleanup_pending:0});
  const user=userEvent.setup();render(<CopyRemovalNotice removal={{copy_id:7,cleanup_pending:1}}/>);
  await user.click(screen.getByRole('button',{name:'Retry photo cleanup'}));expect((await screen.findByRole('alert')).textContent).toContain('Storage temporarily unavailable');
  await user.click(screen.getByRole('button',{name:'Retry photo cleanup'}));expect(screen.queryByRole('button',{name:'Retry photo cleanup'})).toBeNull();
  expect(api).toHaveBeenLastCalledWith('/import-batches/cleanup','POST');
});
