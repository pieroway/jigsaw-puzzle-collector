// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {act,cleanup,render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import {api,session} from './import/api';

vi.mock('./import/api',()=>({api:vi.fn(),session:vi.fn()}));
vi.mock('./import/PrivateCollection',()=>({PrivateCollection:()=> <p>My private puzzles</p>}));
beforeEach(()=>{
  vi.clearAllMocks(); localStorage.clear();
  localStorage.setItem('jigsaw-theme','dark');localStorage.setItem('jigsaw-motion','on');
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
  vi.mocked(session).mockResolvedValue({user:{id:1,email:'collector@example.test'},csrf:'token'});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('opts into the compact test theme, persists it, and preserves colour and motion choices',async()=>{
  localStorage.setItem('jigsaw-tab','Profile');const user=userEvent.setup();const first=render(<App/>);
  const layout=within(screen.getByRole('group',{name:'Layout theme'}));
  expect(layout.getByRole('button',{name:'Standard'}).getAttribute('aria-pressed')).toBe('true');
  await user.click(layout.getByRole('button',{name:'Compact (test)'}));
  expect(document.documentElement.dataset.layoutTheme).toBe('compact');expect(localStorage.getItem('jigsaw-layout-theme')).toBe('compact');
  expect(document.documentElement.dataset.theme).toBe('dark');expect(document.documentElement.dataset.reducedMotion).toBe('true');
  await user.click(within(screen.getByRole('group',{name:'Appearance'})).getByRole('button',{name:'Light'}));
  expect(document.documentElement.dataset.theme).toBe('light');expect(document.documentElement.dataset.layoutTheme).toBe('compact');
  first.unmount();render(<App/>);
  expect(screen.getByRole('button',{name:'Compact (test)'}).getAttribute('aria-pressed')).toBe('true');
  await user.click(screen.getByRole('button',{name:'Standard'}));expect(document.documentElement.dataset.layoutTheme).toBe('standard');
  expect(document.documentElement.dataset.theme).toBe('light');expect(localStorage.getItem('jigsaw-layout-theme')).toBe('standard');
});
it('opens Home from navigation and returns to the private collection',async()=>{
  vi.mocked(api).mockResolvedValue({totals:{puzzles:0,manufacturers:0,known_pieces:0},batches:[],recent:[]});
  const user=userEvent.setup();render(<App/>);await screen.findByText('My private puzzles');
  await user.click(screen.getAllByRole('button',{name:'Home'}).slice(-1)[0]!);
  await screen.findByText('Your first puzzle belongs here.');
  expect(api).toHaveBeenCalledWith('/home');
  await user.click(screen.getByRole('button',{name:'View collection'}));await screen.findByText('My private puzzles');
});

it('signs out from the collection, closes private views and preserves preferences',async()=>{
  let finish!:(value:unknown)=>void;
  vi.mocked(api).mockReturnValue(new Promise<unknown>(resolve=>{finish=resolve;}));
  const user=userEvent.setup();render(<App/>);
  await screen.findByText('My private puzzles');
  await user.click(screen.getByRole('button',{name:'Sign out'}));
  expect(api).toHaveBeenCalledWith('/auth/logout','POST');
  expect(screen.getByRole('button',{name:'Signing out…'}).hasAttribute('disabled')).toBe(true);
  await act(async()=>{finish({user:null,csrf:'new-token'});});
  await screen.findByText('Illustrative sample data');
  expect(screen.queryByText('My private puzzles')).toBeNull();
  expect(screen.queryByRole('button',{name:'Sign out'})).toBeNull();
  expect(screen.getByRole('button',{name:'Log in'})).toBeTruthy();
  expect(screen.getAllByRole('button',{name:'Add'}).every(button=>button.hasAttribute('disabled'))).toBe(true);
  expect(localStorage.getItem('jigsaw-theme')).toBe('dark');
  expect(localStorage.getItem('jigsaw-motion')).toBe('on');
});

it('offers sign-out from Profile and retains the session when logout fails',async()=>{
  vi.mocked(api).mockRejectedValue(new Error('Connection lost. Please retry.'));
  const user=userEvent.setup();render(<App/>);
  await screen.findByText('My private puzzles');
  await user.click(screen.getAllByRole('button',{name:'Profile'}).slice(-1)[0]!);
  await user.click(screen.getByRole('button',{name:'Sign out'}));
  expect((await screen.findByRole('alert')).textContent).toBe('Connection lost. Please retry.');
  await waitFor(()=>expect(screen.getByRole('button',{name:'Sign out'}).hasAttribute('disabled')).toBe(false));
  await user.click(screen.getAllByRole('button',{name:'Collection'}).slice(-1)[0]!);
  await screen.findByText('My private puzzles');
});

it('keeps exactly one sign-out in the main header while importing',async()=>{
  vi.mocked(api).mockResolvedValueOnce({batches:[]}).mockResolvedValueOnce({user:null,csrf:'new-token'});
  const user=userEvent.setup();render(<App/>);
  await screen.findByText('My private puzzles');
  await user.click(screen.getAllByRole('button',{name:'Add'}).slice(-1)[0]!);
  await screen.findByText('collector@example.test');
  expect(screen.getAllByRole('button',{name:'Sign out'})).toHaveLength(1);
  const button=screen.getByRole('button',{name:'Sign out'});
  expect(button.closest('.app-topline')).not.toBeNull();
  await user.click(button);
  await screen.findByText('Illustrative sample data');
  expect(screen.queryByText('collector@example.test')).toBeNull();
  expect(api).toHaveBeenCalledWith('/auth/logout','POST');
});

it('requires header login before enabling Add and ignores a saved signed-out Add tab',async()=>{
  vi.mocked(session).mockResolvedValue({user:null,csrf:'guest-token'});localStorage.setItem('jigsaw-tab','Add');
  vi.mocked(api).mockResolvedValue({user:{id:1,email:'collector@example.test'},csrf:'signed-in-token'});
  const user=userEvent.setup();render(<App/>);
  const login=screen.getByRole('button',{name:'Log in'});
  await waitFor(()=>expect(login.hasAttribute('disabled')).toBe(false));
  expect(login.closest('.app-topline')).not.toBeNull();
  expect(screen.getAllByRole('button',{name:'Add'}).every(button=>button.hasAttribute('disabled'))).toBe(true);
  expect(screen.queryByLabelText('Email')).toBeNull();
  await user.click(login);
  const form=screen.getByRole('form',{name:'Account login'});
  await user.type(within(form).getByLabelText('Email'),'collector@example.test');
  await user.type(within(form).getByLabelText('Password'),'collector password 42!');
  await user.click(within(form).getByRole('button',{name:'Log in'}));
  await screen.findByText('My private puzzles');
  expect(api).toHaveBeenCalledWith('/auth/login','POST',{email:'collector@example.test',password:'collector password 42!'});
  expect(screen.getAllByRole('button',{name:'Add'}).every(button=>!button.hasAttribute('disabled'))).toBe(true);
  expect(screen.getByRole('button',{name:'Sign out'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Log in'})).toBeNull();
});

it('keeps Add disabled after login failure and allows canceling the account screen',async()=>{
  vi.mocked(session).mockResolvedValue({user:null,csrf:'guest-token'});
  vi.mocked(api).mockRejectedValue(new Error('Email or password is incorrect.'));
  const user=userEvent.setup();render(<App/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Log in'}).hasAttribute('disabled')).toBe(false));
  await user.click(screen.getByRole('button',{name:'Log in'}));
  const form=screen.getByRole('form',{name:'Account login'});
  await user.type(within(form).getByLabelText('Email'),'collector@example.test');await user.type(within(form).getByLabelText('Password'),'incorrect password 42!');
  await user.click(within(form).getByRole('button',{name:'Log in'}));
  expect((await screen.findByRole('alert')).textContent).toBe('Email or password is incorrect.');
  expect(screen.getAllByRole('button',{name:'Add'}).every(button=>button.hasAttribute('disabled'))).toBe(true);
  await user.click(within(form).getByRole('button',{name:'Cancel'}));
  expect(screen.queryByRole('form',{name:'Account login'})).toBeNull();
});
