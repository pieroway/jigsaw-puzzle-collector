// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ImportWorkspace} from './ImportWorkspace';
import {api,session} from './api';
vi.mock('./api',()=>({api:vi.fn(),session:vi.fn()}));
const batch={id:7,created_at:'2026-11-07 12:00:00',items:[],summary:{uploaded:0,identified:0,queued:0,processing:0,image_review:0,needs_review:0,approved:0,imported:0,failed:0,rejected:0}};
beforeEach(()=>{
  vi.clearAllMocks();localStorage.clear();localStorage.setItem('jigsaw-pending-1-7','[]');
  vi.mocked(session).mockResolvedValue({user:{id:1,email:'collector@example.test'},csrf:'token'});
});
afterEach(cleanup);
it('resumes the Home-selected batch instead of the saved or newest batch',async()=>{
  localStorage.setItem('jigsaw-import-batch','7');
  vi.mocked(api).mockResolvedValueOnce({batches:[{id:7,created_at:batch.created_at}]}).mockResolvedValueOnce({...batch,id:42});
  render(<ImportWorkspace initialBatchId={42} onViewCollection={vi.fn()} onSession={vi.fn()}/>);
  await screen.findByRole('button',{name:'Delete batch'});
  expect(api).toHaveBeenCalledWith('/import-batches/42');expect(api).not.toHaveBeenCalledWith('/import-batches/7');
  expect(localStorage.getItem('jigsaw-import-batch')).toBe('42');
  expect((screen.getByRole('combobox',{name:'Resume batch'}) as HTMLSelectElement).value).toBe('42');
});
it('never offers login or import controls when the session is signed out',async()=>{
  vi.mocked(session).mockResolvedValue({user:null,csrf:'guest-token'});
  render(<ImportWorkspace onViewCollection={vi.fn()} onSession={vi.fn()}/>);
  await screen.findByText('Log in using the main header before adding puzzles.');
  expect(screen.queryByLabelText('Email')).toBeNull();expect(screen.queryByRole('button',{name:'New photo batch'})).toBeNull();
  expect(api).not.toHaveBeenCalled();
});
it('removes the selected batch and its resume keys after successful deletion',async()=>{
  vi.mocked(api).mockResolvedValueOnce({batches:[{id:7,created_at:batch.created_at}]}).mockResolvedValueOnce(batch).mockResolvedValueOnce({retained_copies:2,cleanup_pending:0}).mockResolvedValueOnce({batches:[],cleanup_pending:0});
  const user=userEvent.setup();render(<ImportWorkspace onViewCollection={vi.fn()} onSession={vi.fn()}/>);
  await screen.findByRole('button',{name:'Delete batch'});
  await user.click(screen.getByRole('button',{name:'Delete batch'}));
  await user.click(screen.getByRole('button',{name:'Delete batch permanently'}));
  await screen.findByText('Batch deleted. 2 imported puzzles were kept in your collection.');
  expect(api).toHaveBeenCalledWith('/import-batches/7','DELETE');
  expect(screen.queryByRole('combobox',{name:'Resume batch'})).toBeNull();
  expect(localStorage.getItem('jigsaw-import-batch')).toBeNull();expect(localStorage.getItem('jigsaw-pending-1-7')).toBeNull();
});
it('retains the selected batch and resume data when deletion fails',async()=>{
  vi.mocked(api).mockResolvedValueOnce({batches:[{id:7,created_at:batch.created_at}]}).mockResolvedValueOnce(batch).mockRejectedValueOnce(new Error('Connection lost. Please retry.'));
  const user=userEvent.setup();render(<ImportWorkspace onViewCollection={vi.fn()} onSession={vi.fn()}/>);
  await screen.findByRole('button',{name:'Delete batch'});await user.click(screen.getByRole('button',{name:'Delete batch'}));
  await user.click(screen.getByRole('button',{name:'Delete batch permanently'}));
  expect((await screen.findByRole('alert')).textContent).toBe('Connection lost. Please retry.');
  expect(screen.getByRole('combobox',{name:'Resume batch'})).toBeTruthy();expect(screen.getByRole('alertdialog')).toBeTruthy();
  expect(localStorage.getItem('jigsaw-import-batch')).toBe('7');expect(localStorage.getItem('jigsaw-pending-1-7')).toBe('[]');
});
