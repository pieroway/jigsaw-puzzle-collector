// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomePage } from './HomePage';
import { api } from '../import/api';
vi.mock('../import/api', () => ({ api: vi.fn() }));
const summary = { totals: { puzzles: 1201, manufacturers: 12, known_pieces: 650000 }, batches: [{ id: 42, created_at: '2026-11-08 12:00:00', remaining: 4, image_review: 2, needs_review: 1, failed: 1, approved: 0, queued: 0, processing: 0 }], recent: [{ id: 9, edition_id: 3, title: 'Garden Birds', manufacturer: 'Example', piece_count: 500, image_url: '/private/9', original_image_url: '/original/9', default_view: 'original' }] };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(api).mockResolvedValue(summary); });
afterEach(cleanup);
it('deletes from Home, refreshes the empty state and ignores an older summary response', async () => {
  const initial = { ...summary, totals: { puzzles: 1, manufacturers: 1, known_pieces: 500 }, batches: [] }; let homes = 0; let finish!: (value: unknown) => void;
  vi.mocked(api).mockImplementation(async (path, method) => {
    if (method === 'DELETE') return { deleted: true, copy_id: 9, cleanup_pending: 0 };
    if (path === '/collection-copies/9') return { copy: { ...summary.recent[0], edit_revision: 1 } };
    homes++; if (homes === 1) return initial; if (homes === 2) return new Promise(resolve => { finish = resolve; }); return { totals: { puzzles: 0, manufacturers: 0, known_pieces: 0 }, batches: [], recent: [] };
  });
  const user = userEvent.setup(); render(<HomePage signedIn sessionReady onCollection={vi.fn()} onResume={vi.fn()} onAdd={vi.fn()} />);
  await user.click(await screen.findByRole('button', { name: /Garden Birds/ })); await user.click(screen.getByRole('button', { name: 'Delete this copy' })); await screen.findByRole('alertdialog');
  await user.click(screen.getByRole('button', { name: 'Delete copy permanently' })); await screen.findByText('Your first puzzle belongs here.');
  expect(screen.getByRole('button', { name: 'View collection' })).toBe(document.activeElement);
  await act(async () => finish(initial)); expect(screen.queryByRole('button', { name: /Garden Birds/ })).toBeNull(); expect(screen.getByText(/0 puzzles/)).toBeTruthy();
});
it('keeps anonymous Home public and adding disabled without requesting private data', async () => {
  const onCollection = vi.fn(); const user = userEvent.setup(); render(<HomePage signedIn={false} sessionReady onCollection={onCollection} onResume={vi.fn()} onAdd={vi.fn()} />);
  expect(api).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Import photos' }).hasAttribute('disabled')).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Browse sample collection' })); expect(onCollection).toHaveBeenCalledOnce();
});
it('shows real totals and resumes the specific batch', async () => {
  const onResume = vi.fn(); const user = userEvent.setup(); render(<HomePage signedIn sessionReady onCollection={vi.fn()} onResume={onResume} onAdd={vi.fn()} />);
  expect((await screen.findByText(/1,201 puzzles/)).textContent).toContain('12 manufacturers');
  expect(screen.getByText(/2 photos to prepare/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Continue batch 42' })); expect(onResume).toHaveBeenCalledWith(42);
});
it('opens shared details and restores Home scroll and card focus', async () => {
  const user = userEvent.setup(); const { container } = render(<div className="scroll-area"><HomePage signedIn sessionReady onCollection={vi.fn()} onResume={vi.fn()} onAdd={vi.fn()} /></div>);
  const card = await screen.findByRole('button', { name: /Garden Birds/ }); const scroller = container.firstElementChild!; scroller.scrollTop = 180;
  await user.click(card); expect(screen.getByRole('heading', { name: 'Garden Birds' })).toBeTruthy();
  expect(screen.getByAltText('Original photograph of Garden Birds').getAttribute('src')).toBe('/original/9');
  await user.click(screen.getByRole('button', { name: /Home/ })); expect(scroller.scrollTop).toBe(180); expect(document.activeElement).toBe(screen.getByRole('button', { name: /Garden Birds/ }));
});
it('offers retry after failure and a real empty welcome after recovery', async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({ totals: { puzzles: 0, manufacturers: 0, known_pieces: 0 }, batches: [], recent: [] });
  const onAdd = vi.fn(); const user = userEvent.setup(); render(<HomePage signedIn sessionReady onCollection={vi.fn()} onResume={vi.fn()} onAdd={onAdd} />);
  expect((await screen.findByRole('alert')).textContent).toContain('Connection lost'); await user.click(screen.getByRole('button', { name: 'Retry Home' }));
  await screen.findByText('Your first puzzle belongs here.'); expect(screen.queryByRole('heading', { name: 'Continue your import' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Import photos' })); expect(onAdd).toHaveBeenCalledOnce();
});
it('discards private data when authentication changes', async () => {
  const props = { sessionReady: true, onCollection: vi.fn(), onResume: vi.fn(), onAdd: vi.fn() }; const { rerender } = render(<HomePage {...props} signedIn />);
  await screen.findByRole('button', { name: /Garden Birds/ }); rerender(<HomePage {...props} signedIn={false} />);
  expect(screen.queryByText('Garden Birds')).toBeNull();
});
