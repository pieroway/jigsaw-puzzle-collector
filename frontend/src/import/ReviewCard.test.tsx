// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewCard } from './ImportWorkspace';
import { type ImportItem } from './model';
afterEach(cleanup);
const item: ImportItem = {
  id: 1, batch_id: 1, client_key: 'one', filename: 'puzzle.jpg', state: 'needs_review', image_url: '/private-photo', error: null, reviewed: false, linked_edition_id: null,
  fields: { title:'Unverified garden', manufacturer:'Ravensburger', pieces:500, product_number:null, release_year:null },
  suggestion: { title:'Unverified garden', manufacturer:'Ravensburger', pieces:500, product_number:null, release_year:null, confidence:'medium', provider:'deterministic_fixture', source:'front_box_photo', catalogue_verified:false, photo_notes:'Garden', evidence:'Unverified fixture' },
  duplicates: { exact_photo:[], identity:[], editions:[] },
};
describe('photo review', () => {
  it('saves human corrections with null unknowns and requires review confirmation', async () => {
    const save = vi.fn(async () => {}); const user = userEvent.setup();
    render(<ReviewCard item={item} busy={false} save={save} action={vi.fn()} retryUpload={vi.fn()} />);
    await user.clear(screen.getByLabelText('Title')); await user.type(screen.getByLabelText('Title'),'My garden');
    await user.click(screen.getByRole('button',{ name:'Save review' }));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ title:'My garden', release_year:null, product_number:null, reviewed:false }));
    await user.click(screen.getByLabelText('I reviewed this photo and its fields'));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ title:'My garden', reviewed:true }));
    expect(screen.getByText(/Not catalogue verified/)).toBeTruthy();
  });
  it('shows actionable failures and a retry file picker', () => {
    render(<ReviewCard item={{ ...item, state:'failed', fields:null, image_url:null, error:'Choose a supported image' }} busy={false} save={vi.fn()} action={vi.fn()} retryUpload={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('Choose a supported image');
    expect(screen.getByLabelText('Retry puzzle.jpg')).toBeTruthy();
  });
  it('flags duplicate photos without removing a physical copy', () => {
    render(<ReviewCard item={{ ...item, duplicates:{ exact_photo:[{ id:2,batch_id:1 }],identity:[],editions:[] } }} busy={false} save={vi.fn()} action={vi.fn()} retryUpload={vi.fn()} />);
    expect(screen.getByText(/separate physical copy/)).toBeTruthy();
  });
  it('retains unsaved text when another card refreshes and prevents approving an unconfirmed edit', async () => {
    const user=userEvent.setup(); const dirty=vi.fn();
    const props={ busy:false, save:vi.fn(), action:vi.fn(), retryUpload:vi.fn(), onDirty:dirty };
    const view=render(<ReviewCard {...props} item={{ ...item,reviewed:true }} />);
    await user.clear(screen.getByLabelText('Title')); await user.type(screen.getByLabelText('Title'),'Unsaved correction');
    view.rerender(<ReviewCard {...props} item={{ ...item,reviewed:true,duplicates:{ ...item.duplicates } }} />);
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Unsaved correction');
    expect(screen.getByRole('button',{ name:/^Approve$/ }).hasAttribute('disabled')).toBe(true);
    expect(dirty).toHaveBeenCalled();
  });
});
