import {FloatingCopyNotice} from './FloatingCopyNotice';

export function SavedChangesNotice({message}:{message:string}) {
  return <FloatingCopyNotice offset={10}><p role="status">{message}</p></FloatingCopyNotice>;
}
