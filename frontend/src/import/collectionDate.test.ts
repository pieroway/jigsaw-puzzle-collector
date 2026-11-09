import {expect,it} from 'vitest';
import {collectionDate} from './collectionDate';
it('interprets database timestamps as UTC and preserves explicit offsets',()=>{
  expect(collectionDate('2026-11-08 01:30:00')?.toISOString()).toBe('2026-11-08T01:30:00.000Z');
  expect(collectionDate('2026-11-07T20:30:00-05:00')?.toISOString()).toBe('2026-11-08T01:30:00.000Z');
});
it('does not invent an added date when missing or invalid',()=>{
  expect(collectionDate()).toBeNull();expect(collectionDate(null)).toBeNull();expect(collectionDate('invalid')).toBeNull();
});
