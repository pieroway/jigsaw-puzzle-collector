// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {DeleteCopyButton} from './DeleteCopyButton';
import type {Copy} from './PrivateCopyDetails';
import {api} from './api';
vi.mock('./api',()=>({api:vi.fn()}));
const copy={id:7,title:'Garden Birds',edit_revision:1} as Copy;
beforeEach(()=>{vi.clearAllMocks();vi.mocked(api).mockResolvedValue({copy:{...copy,edit_revision:2}});});afterEach(cleanup);
it('checks the latest revision and requires confirmation while allowing cancellation',async()=>{
  const user=userEvent.setup();render(<DeleteCopyButton copy={copy} disabled={false} onRemoved={vi.fn()} onUnavailable={vi.fn()}/>);
  await user.click(screen.getByRole('button',{name:'Delete this copy'}));await screen.findByRole('alertdialog',{name:'Delete Garden Birds'});
  expect(screen.queryByRole('button',{name:'Delete this copy'})).toBeNull();
  expect(screen.getByText(/Photos still used by import history/)).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Keep copy'}));expect(screen.queryByRole('alertdialog')).toBeNull();expect(api).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(screen.getByRole('button',{name:'Delete this copy'}));
  await user.click(screen.getByRole('button',{name:'Delete this copy'}));await screen.findByRole('alertdialog');await user.keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog')).toBeNull();expect(document.activeElement).toBe(screen.getByRole('button',{name:'Delete this copy'}));
});
it('reports a missing copy without attempting deletion',async()=>{
  vi.mocked(api).mockRejectedValue(Object.assign(new Error('Not found'),{status:404}));const onUnavailable=vi.fn();const onRemoved=vi.fn();
  const user=userEvent.setup();render(<DeleteCopyButton copy={copy} disabled={false} onRemoved={onRemoved} onUnavailable={onUnavailable}/>);
  await user.click(screen.getByRole('button',{name:'Delete this copy'}));expect(onUnavailable).toHaveBeenCalledOnce();expect(onRemoved).not.toHaveBeenCalled();expect(api).toHaveBeenCalledTimes(1);
});
it('deletes only the confirmed copy using its freshly loaded revision',async()=>{
  const user=userEvent.setup();const onRemoved=vi.fn();let finish!:(value:unknown)=>void;
  vi.mocked(api).mockResolvedValueOnce({copy:{...copy,edit_revision:2}}).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  render(<DeleteCopyButton copy={copy} disabled={false} onRemoved={onRemoved} onUnavailable={vi.fn()}/>);
  await user.click(screen.getByRole('button',{name:'Delete this copy'}));await screen.findByRole('alertdialog');await user.click(screen.getByRole('button',{name:'Delete copy permanently'}));
  expect(api).toHaveBeenLastCalledWith('/collection-copies/7','DELETE',{revision:2});expect(screen.getByRole('button',{name:'Keep copy'}).hasAttribute('disabled')).toBe(true);
  await act(async()=>finish({deleted:true,copy_id:7,cleanup_pending:1}));expect(onRemoved).toHaveBeenCalledWith({deleted:true,copy_id:7,cleanup_pending:1});
});
it('keeps failed deletion recoverable and requires a fresh review after a conflict',async()=>{
  const user=userEvent.setup();const onRemoved=vi.fn();vi.mocked(api).mockResolvedValueOnce({copy:{...copy,edit_revision:2}}).mockRejectedValueOnce(Object.assign(new Error('Changed on another device.'),{status:409}));
  render(<DeleteCopyButton copy={copy} disabled={false} onRemoved={onRemoved} onUnavailable={vi.fn()}/>);
  await user.click(screen.getByRole('button',{name:'Delete this copy'}));await screen.findByRole('alertdialog');await user.click(screen.getByRole('button',{name:'Delete copy permanently'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Changed on another device');expect(onRemoved).not.toHaveBeenCalled();
  expect(screen.getByRole('button',{name:'Delete copy permanently'}).hasAttribute('disabled')).toBe(true);expect(screen.getByRole('button',{name:'Review latest copy'})).toBeTruthy();
});
