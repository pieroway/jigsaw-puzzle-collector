// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AiRecognition } from './AiRecognition';
import { api } from './api';

vi.mock('./api', () => ({ api: vi.fn() }));

it('requires consent and applies suggestions only on request', async () => {
  const apply = vi.fn();
  vi.mocked(api).mockResolvedValue({
    fields: { title: 'Evening Harbor', manufacturer: null, pieces: 500, product_number: '0012' },
    barcode: null, revision: 'original',
  });
  render(<AiRecognition itemId={7} revision="original" busy={false} apply={apply}/>);
  const identify = screen.getByRole<HTMLButtonElement>('button', { name: 'Identify puzzle with AI' });
  expect(identify.disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(identify);
  const useNumber = await screen.findByRole('button', { name: 'Use product number' });
  expect(api).toHaveBeenCalledWith('/import-items/7/identify', 'POST', { consent: true, revision: 'original' });
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(useNumber);
  expect(apply).toHaveBeenCalledWith('product_number', '0012');
  expect(identify.disabled).toBe(true);
});
