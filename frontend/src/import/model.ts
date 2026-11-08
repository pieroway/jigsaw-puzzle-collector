export type Fields = { title: string | null; manufacturer: string | null; pieces: number | null; product_number: string | null; release_year: number | null };
export type Draft = Record<keyof Fields, string>;
export type Corners = [[number,number],[number,number],[number,number],[number,number]];
export type StudioSettings = { depth:'thin'|'standard'|'deep'; view:'front'|'three-quarter'; background:'light'|'dark'|'transparent'; enabled:boolean; dimensions:{width_mm?:number;height_mm?:number;depth_mm?:number} };
export type Preprocessing = { status: 'ready' | 'failed'; decision: 'pending' | 'accepted' | 'rejected'; revision: string; corners: Corners; confidence: number; low_confidence: boolean; requires_review: boolean; engine?: string; manual?: boolean; orientation?: { angle:number; source:'ocr'|'manual'|'unavailable'; ambiguous:boolean; low_ocr_confidence?:boolean; reason:string }; studio?:{status:'ready'|'failed'|'unavailable';settings:StudioSettings;error?:string;dimensions?:{width_mm:number;height_mm:number;depth_mm:number;front_source:string;depth_source:string;verified:false}}; warnings: string[]; error?: string; oriented_size?: [number,number]; settings?: { exposure_gain:number; white_balance_gains:number[]; contrast:number; sharpening:number } };
export type ImportItem = {
  id: number; batch_id: number; client_key: string; filename: string;
  state: 'queued' | 'processing' | 'image_review' | 'needs_review' | 'approved' | 'imported' | 'failed' | 'rejected';
  preprocessing?: Preprocessing | null; source_image_url?: string | null; processed_image_url?: string | null; studio_image_url?:string|null;
  image_url: string | null; error: string | null; reviewed: boolean; fields: Fields | null;
  linked_edition_id: number | null;
  suggestion: (Fields & { provider: string; source: string; confidence: string; catalogue_verified: boolean; photo_notes: string | null; evidence: string }) | null;
  duplicates: { exact_photo: { id: number; batch_id: number }[]; identity: number[]; editions: { id: number; title: string; catalogue_verified: boolean }[] };
};
export type Batch = { id: number; created_at: string; items: ImportItem[]; summary: Record<string, number>; errors?: { id: number; error: string }[] };
export function counts(items: { state: string; suggestion?: { title: string | null } | null }[]): Record<string, number> {
  const result: Record<string, number> = { uploaded: items.length, identified: 0, queued: 0, processing: 0, image_review:0, needs_review: 0, approved: 0, imported: 0, failed: 0, rejected: 0 };
  for (const item of items) { result[item.state]++; if (item.suggestion?.title) result.identified++; }
  return result;
}
export function reviewPayload(draft: Draft): Fields {
  return { title: draft.title.trim() || null, manufacturer: draft.manufacturer.trim() || null, pieces: draft.pieces === '' ? null : Number(draft.pieces), product_number: draft.product_number.trim() || null, release_year: draft.release_year === '' ? null : Number(draft.release_year) };
}
export function toDraft(fields: Fields | null): Draft {
  return { title: fields?.title ?? '', manufacturer: fields?.manufacturer ?? '', pieces: fields?.pieces?.toString() ?? '', product_number: fields?.product_number ?? '', release_year: fields?.release_year?.toString() ?? '' };
}
