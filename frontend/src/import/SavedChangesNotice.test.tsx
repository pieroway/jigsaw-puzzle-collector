// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {SavedChangesNotice} from './SavedChangesNotice';
afterEach(()=>{cleanup();vi.useRealTimers();});
it('floats save feedback above the page for five seconds before fading',()=>{
  vi.useFakeTimers();const {container}=render(<SavedChangesNotice message="Changes saved."/>);
  expect(container.textContent).toBe('');const panel=screen.getByRole('status').closest('.copy-removal-notice')!;
  act(()=>vi.advanceTimersByTime(4999));expect(panel.getAttribute('data-phase')).toBe('visible');
  act(()=>vi.advanceTimersByTime(1));expect(panel.getAttribute('data-phase')).toBe('fade');
  act(()=>vi.advanceTimersByTime(550));expect(screen.queryByRole('status')).toBeNull();
});
it('allows early dismissal by upward swipe',()=>{
  vi.useFakeTimers();render(<SavedChangesNotice message="Changes saved."/>);const panel=screen.getByRole('status').closest('.copy-removal-notice')!;
  fireEvent.touchStart(panel,{touches:[{clientY:160}]});fireEvent.touchMove(panel,{touches:[{clientY:100}]});
  expect(panel.getAttribute('data-phase')).toBe('swipe');act(()=>vi.advanceTimersByTime(550));expect(screen.queryByRole('status')).toBeNull();
});
it('cleans up timers when leaving the details',()=>{
  vi.useFakeTimers();const {unmount}=render(<SavedChangesNotice message="Changes saved."/>);
  unmount();expect(vi.getTimerCount()).toBe(0);
});
