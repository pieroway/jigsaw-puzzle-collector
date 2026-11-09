// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {PhotoFilePicker} from './PhotoFilePicker';
afterEach(cleanup);
it('keeps a native picker, shows filenames, and allows choosing the same photo again',async()=>{
  const onFiles=vi.fn();const user=userEvent.setup();render(<PhotoFilePicker disabled={false} onFiles={onFiles}/>);
  const input=screen.getByLabelText('Choose puzzle photos') as HTMLInputElement;
  const photo=new File(['photo'],'box.jpg',{type:'image/jpeg'});
  await user.upload(input,photo);expect(onFiles).toHaveBeenLastCalledWith([photo]);expect(screen.getByText('box.jpg')).toBeTruthy();expect(input.value).toBe('');
  await user.upload(input,[photo,new File(['other'],'other.png',{type:'image/png'})]);expect(screen.getByText('2 files selected')).toBeTruthy();expect(onFiles).toHaveBeenCalledTimes(2);
});
it('disables choosing files while the batch is busy',async()=>{
  const onFiles=vi.fn();const user=userEvent.setup();render(<PhotoFilePicker disabled onFiles={onFiles}/>);
  await user.upload(screen.getByLabelText('Choose puzzle photos'),new File(['photo'],'box.jpg',{type:'image/jpeg'}));
  expect(onFiles).not.toHaveBeenCalled();expect(screen.getByText('No files chosen')).toBeTruthy();
});
