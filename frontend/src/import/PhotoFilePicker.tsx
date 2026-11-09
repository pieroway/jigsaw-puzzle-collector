import {useState} from 'react';
import './PhotoFilePicker.css';

export function PhotoFilePicker({disabled,onFiles}:{disabled:boolean;onFiles:(files:File[])=>void}) {
  const [selection,setSelection]=useState('No files chosen');
  return <label className="file-picker">Choose puzzle photos
    <span className="photo-file-row" data-disabled={disabled}>
      <span className="photo-file-control"><span aria-hidden="true">Choose files</span>
        <input aria-label="Choose puzzle photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled} onChange={event=>{
          const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value='';
          if(!files.length)return;
          setSelection(files.length===1?files[0].name:`${files.length} files selected`);onFiles(files);
        }}/>
      </span>
      <span className="photo-file-name" aria-live="polite">{selection}</span>
    </span>
  </label>;
}
