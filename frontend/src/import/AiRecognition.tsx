import { useState } from 'react';
import { api } from './api';

const labels = { title: 'Title', manufacturer: 'Manufacturer', pieces: 'Pieces', product_number: 'Product number' };
export type RecognitionField = keyof typeof labels;
type Suggestion = { fields: Record<RecognitionField, string | number | null>; barcode: string | null; revision: string };

export function AiRecognition({ itemId, revision, busy, apply }: {
  itemId: number;
  revision: string;
  busy: boolean;
  apply: (field: RecognitionField, value: string) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState('');

  async function identify() {
    setLoading(true);
    setSuggestion(null);
    setError('');
    try {
      const result = await api<Suggestion>(`/import-items/${itemId}/identify`, 'POST', { consent, revision });
      if (result.revision === revision) setSuggestion(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'AI identification failed.');
    } finally {
      setConsent(false);
      setLoading(false);
    }
  }

  return <div className="evidence">
    <label className="review-check">
      <input type="checkbox" checked={consent} disabled={busy || loading} onChange={event => setConsent(event.target.checked)} />
      Send this front photo to Google Gemini. Google may use free-tier submissions to improve its products.
    </label>
    <button type="button" disabled={busy || loading || !consent} onClick={() => void identify()}>Identify puzzle with AI</button>
    {loading && <p role="status">Identifying puzzle...</p>}
    {error && <p role="alert">{error}</p>}
    {suggestion && <>
      <p>AI suggestions. Compare each value with the box before applying it.</p>
      {(Object.keys(labels) as RecognitionField[]).map(field => {
        const value = suggestion.fields[field];
        return value == null ? null : <div key={field}>
          {labels[field]}: {value} <button type="button" disabled={busy} onClick={() => apply(field, String(value))}>Use {labels[field].toLowerCase()}</button>
        </div>;
      })}
      {suggestion.barcode && <p>Printed barcode: {suggestion.barcode}</p>}
      {!suggestion.barcode && Object.values(suggestion.fields).every(value => value == null) && <p>Google Gemini could not read any puzzle details.</p>}
    </>}
  </div>;
}
