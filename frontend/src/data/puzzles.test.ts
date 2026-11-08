import { describe, expect, it } from 'vitest';
import { filterPuzzles, puzzles } from './puzzles';
describe('collection filtering', () => {
  it('matches title case-insensitively', () => expect(filterPuzzles(puzzles, 'ALPINE', 'All')).toHaveLength(1));
  it('filters by theme', () => expect(filterPuzzles(puzzles, '', 'Nature')).toHaveLength(2));
  it('retains distinct owned puzzle examples', () => expect(new Set(puzzles.map(p => p.id)).size).toBe(puzzles.length));
});
