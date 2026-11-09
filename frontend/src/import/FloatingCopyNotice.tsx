import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import './CopyDeletion.css';
export function FloatingCopyNotice({children,duration=5000,paused=false,offset=0}:{children:ReactNode;duration?:number;paused?:boolean;offset?:number}) {
  const [phase,setPhase]=useState<'visible'|'fade'|'swipe'|'hidden'>('visible');const startY=useRef<number|null>(null);
  useEffect(()=>{
    if(phase==='hidden'||paused)return;
    const timer=window.setTimeout(()=>setPhase(phase==='visible'?'fade':'hidden'),phase==='visible'?duration:550);
    return()=>window.clearTimeout(timer);
  },[phase,paused,duration]);
  function swipe(y:number){if(startY.current!==null&&startY.current-y>40){setPhase('swipe');startY.current=null;}}
  if(phase==='hidden')return null;
  return createPortal(<div className="copy-removal-overlay" style={offset?{top:`calc(env(safe-area-inset-top, 0px) + ${76+offset}px)`}:undefined}><div className="copy-removal-notice" data-phase={phase}
    onPointerDown={event=>{startY.current=event.clientY;}}
    onPointerUp={event=>{swipe(event.clientY);startY.current=null;}}
    onPointerCancel={()=>{startY.current=null;}}
    onTouchStart={event=>{startY.current=event.touches[0]?.clientY??null;}}
    onTouchMove={event=>{if(event.touches[0])swipe(event.touches[0].clientY);}}
    onTouchEnd={()=>{startY.current=null;}}>
    <button className="copy-removal-close" type="button" aria-label="Dismiss notification" onClick={()=>setPhase('fade')}><X size={18} aria-hidden="true"/></button>
    {children}
  </div></div>,document.body);
}
