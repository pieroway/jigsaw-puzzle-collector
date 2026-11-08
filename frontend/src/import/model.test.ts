import { describe, expect, it } from 'vitest';
import { counts, reviewPayload } from './model';

describe('import review model', () => {
  it('preserves null unknowns and human title edits', () => {
    expect(reviewPayload({ title: 'Corrected title', manufacturer: '', pieces: '', product_number: '', release_year: '' })).toEqual({ title: 'Corrected title', manufacturer: null, pieces: null, product_number: null, release_year: null });
  });
  it('counts partial failures without discarding successful items', () => {
    expect(counts([{ state: 'needs_review' }, { state: 'failed' }, { state: 'imported' }])).toMatchObject({ uploaded: 3, needs_review: 1, failed: 1, imported: 1 });
  });
});
