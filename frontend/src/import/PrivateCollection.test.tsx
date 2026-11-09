// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,within,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {PrivateCollection} from './PrivateCollection';
import {api} from './api';
vi.mock('./api',()=>({api:vi.fn()}));
const copies=[
  {id:1,edition_id:1,title:'Garden Birds',manufacturer:'Ravensburger',piece_count:500,sku:'N-1',image_url:'/photos/1.webp',uses_studio:true},
  {id:2,edition_id:2,title:'Alpine Village',manufacturer:'Buffalo',piece_count:1000,sku:'N-2',image_url:'/photos/2.webp',uses_studio:true},
  {id:3,edition_id:3,title:'Night Garden',manufacturer:'ravensburger',piece_count:null,sku:'N-3',image_url:'/photos/3.webp',studio_image_url:'/studio/3.webp',corrected_image_url:'/front/3.jpg',original_image_url:'/original/3.jpg',uses_studio:true,default_view:'studio'},
];
beforeEach(()=>{vi.clearAllMocks();vi.mocked(api).mockResolvedValue({copies});});
afterEach(cleanup);
it('removes only the selected copy and restores focus to a remaining card',async()=>{
  vi.mocked(api).mockImplementation(async(path,method)=>path==='/collection'?{copies}:method==='DELETE'?{deleted:true,copy_id:2,cleanup_pending:0}:{copy:{...copies[1],edit_revision:1}});
  const user=userEvent.setup();render(<PrivateCollection onAdd={vi.fn()}/>);
  await user.click(await screen.findByRole('button',{name:/Alpine Village/}));await user.click(screen.getByRole('button',{name:'Delete this copy'}));await screen.findByRole('alertdialog');
  await user.click(screen.getByRole('button',{name:'Delete copy permanently'}));
  expect(screen.getAllByTestId('private-copy')).toHaveLength(2);expect(screen.queryByRole('button',{name:/Alpine Village/})).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button',{name:/Garden Birds/}));
  expect(within(screen.getByRole('group',{name:'Collection totals'})).getByText('500')).toBeTruthy();
});
it('edits a copy privately and immediately refreshes its gallery metadata and totals',async()=>{
  const source={...copies[2],edit_revision:1,storage_location:null,notes:null};const saved={...source,title:'Corrected Garden',manufacturer:'New Maker',piece_count:1500,notes:'Shelf note',edit_revision:2};
  vi.mocked(api).mockImplementation(async(path,method)=>path==='/collection'?{copies}:method==='PATCH'?{copy:saved}:{copy:source});
  const user=userEvent.setup();render(<PrivateCollection onAdd={vi.fn()}/>);
  await user.click(await screen.findByRole('button',{name:/Night Garden/}));await user.click(screen.getByRole('button',{name:'Edit'}));
  const title=await screen.findByLabelText('Title');await user.clear(title);await user.type(title,'Corrected Garden');
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  await user.keyboard('{Escape}');expect(screen.getByRole('form',{name:'Edit your copy'})).toBeTruthy();
  await user.click(screen.getByRole('button',{name:/Collection/}));expect(screen.getByRole('form',{name:'Edit your copy'})).toBeTruthy();confirm.mockRestore();
  await user.click(screen.getByRole('button',{name:'Save changes'}));await screen.findByText('Changes saved.');
  expect(screen.getByRole('heading',{name:'Corrected Garden'})).toBeTruthy();expect(screen.getByText('Shelf note')).toBeTruthy();
  await user.click(screen.getByRole('button',{name:/Collection/}));expect(screen.getByRole('button',{name:/Corrected Garden/})).toBeTruthy();
  expect(within(screen.getByRole('group',{name:'Collection totals'})).getByText('3,000')).toBeTruthy();
  await user.type(screen.getByLabelText('Search your collection'),'New Maker');expect(screen.getAllByTestId('private-copy')).toHaveLength(1);
});

it('shows real collection totals and combines manufacturer, piece-count and search filters',async()=>{
  const user=userEvent.setup();render(<PrivateCollection onAdd={vi.fn()}/>);
  await screen.findByText('Night Garden');
  const totals=within(screen.getByRole('group',{name:'Collection totals'}));
  expect(totals.getByText('3')).toBeTruthy();expect(totals.getByText('2')).toBeTruthy();expect(totals.getByText('1,500')).toBeTruthy();
  expect(screen.queryByText('On wishlist')).toBeNull();
  await user.click(screen.getByRole('button',{name:'Ravensburger'}));expect(screen.getAllByTestId('private-copy')).toHaveLength(2);
  await user.click(screen.getByRole('button',{name:'Filter by piece count'}));
  await user.selectOptions(screen.getByLabelText('Piece count'),'500');expect(screen.getAllByTestId('private-copy')).toHaveLength(1);expect(screen.getByText('Garden Birds')).toBeTruthy();
  await user.selectOptions(screen.getByLabelText('Piece count'),'unknown');expect(screen.getByText('Night Garden')).toBeTruthy();
  await user.type(screen.getByLabelText('Search your collection'),'no match');
  expect(screen.queryAllByTestId('private-copy')).toHaveLength(0);
  await user.click(screen.getAllByRole('button',{name:'Clear filters'})[0]);
  expect(screen.getAllByTestId('private-copy')).toHaveLength(3);
  await user.type(screen.getByLabelText('Search your collection'),'N-2');expect(screen.getAllByTestId('private-copy')).toHaveLength(1);expect(screen.getByText('Alpine Village')).toBeTruthy();
});

it('sorts real cards and switches between gallery and list without changing photo assets',async()=>{
  const settings=vi.fn();const add=vi.fn();const user=userEvent.setup();render(<PrivateCollection onAdd={add} onSettings={settings}/>);
  await screen.findByText('Night Garden');
  await user.selectOptions(screen.getByLabelText('Sort collection'),'title');
  expect(screen.getAllByTestId('private-copy').map(card=>card.getAttribute('data-copy-id'))).toEqual(['2','1','3']);
  await user.click(screen.getByRole('button',{name:'List view'}));
  expect(screen.getByRole('button',{name:'List view'}).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getAllByTestId('private-copy')[0].closest('.list-view')).not.toBeNull();
  expect(within(screen.getAllByTestId('private-copy')[0]).getByRole('img').getAttribute('src')).toBe('/photos/2.webp');
  await user.selectOptions(screen.getByLabelText('Sort collection'),'pieces');
  expect(screen.getAllByTestId('private-copy').map(card=>card.getAttribute('data-copy-id'))).toEqual(['1','2','3']);
  await user.click(screen.getByRole('button',{name:'Gallery view'}));expect(screen.getByRole('button',{name:'Gallery view'}).getAttribute('aria-pressed')).toBe('true');
  await user.click(screen.getByRole('button',{name:'Collection settings'}));expect(settings).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button',{name:'Import more photos'}));expect(add).toHaveBeenCalledOnce();
});

it('reverses each sort order while keeping unknown piece counts last',async()=>{
  const user=userEvent.setup();render(<PrivateCollection onAdd={vi.fn()}/>);await screen.findByText('Night Garden');
  const ids=()=>screen.getAllByTestId('private-copy').map(card=>card.getAttribute('data-copy-id'));
  const reverse=screen.getByRole('button',{name:'Reverse sort order'});
  expect(ids()).toEqual(['3','2','1']);await user.click(reverse);expect(ids()).toEqual(['1','2','3']);expect(reverse.getAttribute('aria-pressed')).toBe('true');
  await user.selectOptions(screen.getByLabelText('Sort collection'),'title');expect(ids()).toEqual(['3','1','2']);
  await user.click(reverse);expect(ids()).toEqual(['2','1','3']);
  await user.selectOptions(screen.getByLabelText('Sort collection'),'pieces');expect(ids()).toEqual(['1','2','3']);
  expect(screen.getByRole('option',{name:'Pieces: low - high'})).toHaveProperty('selected',true);
  await user.click(reverse);expect(ids()).toEqual(['2','1','3']);
  expect(screen.getByRole('option',{name:'Pieces: high - low'})).toHaveProperty('selected',true);
  await user.click(reverse);expect(ids()).toEqual(['1','2','3']);
  expect(screen.getByRole('option',{name:'Pieces: low - high'})).toHaveProperty('selected',true);
  await user.click(reverse);
  await user.click(screen.getByRole('button',{name:/Alpine Village/}));await user.keyboard('{Escape}');expect(ids()).toEqual(['2','1','3']);expect(screen.getByRole('button',{name:'Reverse sort order'}).getAttribute('aria-pressed')).toBe('true');
});

it('sorts by added timestamp before ID, reverses ties, and displays the recorded date',async()=>{
  vi.mocked(api).mockResolvedValue({copies:[
    {...copies[0],created_at:'2026-11-08 12:00:00'},
    {...copies[1],created_at:'2026-11-01 12:00:00'},
    {...copies[2],created_at:'2026-11-01 12:00:00'},
    {...copies[0],id:99,title:'Unknown date',created_at:null},
  ]});
  const user=userEvent.setup();render(<PrivateCollection onAdd={vi.fn()}/>);await screen.findByText('Night Garden');
  const ids=()=>screen.getAllByTestId('private-copy').map(card=>card.getAttribute('data-copy-id'));
  expect(ids()).toEqual(['1','3','2','99']);await user.click(screen.getByRole('button',{name:'Reverse sort order'}));expect(ids()).toEqual(['2','3','1','99']);
  await user.click(screen.getByRole('button',{name:/Garden Birds/}));
  const date=screen.getByText('Added to collection').nextElementSibling!.querySelector('time')!;
  expect(date.getAttribute('datetime')).toBe('2026-11-08T12:00:00.000Z');
  expect(date.textContent).toBe(new Date('2026-11-08T12:00:00Z').toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}));
  await user.keyboard('{Escape}');await user.click(screen.getByRole('button',{name:/Unknown date/}));
  expect(screen.getByText('Added to collection').nextElementSibling!.textContent).toBe('Unknown');
});

it('preserves search, pills, list mode, focus and scroll when returning from details',async()=>{
  const user=userEvent.setup();const {container}=render(<div className="scroll-area"><PrivateCollection onAdd={vi.fn()}/></div>);
  await screen.findByText('Night Garden');
  await user.click(screen.getByRole('button',{name:'Ravensburger'}));await user.type(screen.getByLabelText('Search your collection'),'Night');await user.click(screen.getByRole('button',{name:'List view'}));
  const scroller=container.querySelector<HTMLElement>('.scroll-area')!;scroller.scrollTop=420;
  await user.click(screen.getByTestId('private-copy'));
  expect(screen.getByRole('heading',{name:'Night Garden'})).toBeTruthy();
  expect(screen.getByRole('img').getAttribute('src')).toBe('/studio/3.webp');expect(scroller.scrollTop).toBe(0);
  await user.keyboard('{Escape}');
  expect((screen.getByLabelText('Search your collection') as HTMLInputElement).value).toBe('Night');
  expect(screen.getByRole('button',{name:'Ravensburger'}).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button',{name:'List view'}).getAttribute('aria-pressed')).toBe('true');
  expect(document.activeElement).toBe(screen.getByTestId('private-copy'));expect(scroller.scrollTop).toBe(420);
});
