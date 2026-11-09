/** MySQL timestamps are returned in UTC without an offset. */
export function collectionDate(value?:string|null):Date|null {
  if(!value)return null;
  const normalized=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)?value.replace(' ','T')+'Z':value;
  const date=new Date(normalized);
  return Number.isFinite(date.getTime())?date:null;
}
