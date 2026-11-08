// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {StudioControls} from './StudioControls';
import type {ImportItem} from './model';
afterEach(cleanup);
it('saves independent presentation controls and actual dimensions without changing corrected pixels',async()=>{
  const item={id:4,filename:'box.jpg',studio_image_url:'/studio',preprocessing:{revision:'v1',studio:{status:'ready',settings:{depth:'standard',view:'three-quarter',background:'transparent',enabled:true,dimensions:{}}}}} as ImportItem;
  const run=vi.fn(async()=>{}); const dirty=vi.fn(); const user=userEvent.setup();
  render(<StudioControls item={item} disabled={false} run={run} onDirty={dirty}/>);
  await user.selectOptions(screen.getByLabelText('Box depth'),'deep');
  await user.selectOptions(screen.getByLabelText('Viewing angle'),'front');
  await user.selectOptions(screen.getByLabelText('Studio background'),'dark');
  await user.click(screen.getByText('Use measured dimensions'));
  await user.type(screen.getByLabelText('Measured depth (mm)'),'45');
  await user.click(screen.getByRole('button',{name:'Apply presentation'}));
  expect(run).toHaveBeenCalledWith('studio',{revision:'v1',settings:{depth:'deep',view:'front',background:'dark',enabled:true,dimensions:{depth_mm:45}}});
  expect(dirty).toHaveBeenCalledWith(true);
});
