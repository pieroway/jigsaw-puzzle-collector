// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {DeleteBatchButton} from './DeleteBatchButton';
afterEach(cleanup);
it('requires confirmation and explains that imported puzzles are retained',async()=>{
  const remove=vi.fn(async()=>true);const user=userEvent.setup();
  render(<DeleteBatchButton id={7} disabled={false} onDelete={remove}/>);
  await user.click(screen.getByRole('button',{name:'Delete batch'}));
  expect(screen.getByRole('alertdialog').textContent).toContain('Puzzles already imported into your collection and their photographs will be kept');
  await user.click(screen.getByRole('button',{name:'Keep batch'}));expect(remove).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button',{name:'Delete batch'}));
  await user.click(screen.getByRole('button',{name:'Delete batch permanently'}));
  expect(remove).toHaveBeenCalledWith(7);expect(screen.queryByRole('alertdialog')).toBeNull();
});
it('keeps confirmation open after a failed deletion so it can be retried',async()=>{
  const remove=vi.fn(async()=>false);const user=userEvent.setup();
  render(<DeleteBatchButton id={7} disabled={false} onDelete={remove}/>);
  await user.click(screen.getByRole('button',{name:'Delete batch'}));
  await user.click(screen.getByRole('button',{name:'Delete batch permanently'}));
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Delete batch permanently'}).hasAttribute('disabled')).toBe(false);
});
