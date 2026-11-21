"use client";
import {useEffect,useRef,useState} from "react";
import {albumSwipe,orderAlbumPhotos,stepAlbumIndex} from "../../lib/uri/album";
import {ArrowIcon,CloseIcon} from "./Icons";

type AlbumEntry={id:string;title:string;body:string;author:string;startDate:string|null;endDate:string|null;photos:string[];coverPhotoId:string|null};
type Props={entry:AlbumEntry;onClose:()=>void;onRemove:(entryId:string,ids:string[],onProgress:(completed:number)=>void)=>Promise<{removed:number;processed:number}>};
const BATCH=24;
const dateText=(date:string|null)=>date?date.replaceAll("-","."):"日期未定";

function Photo({id,alt,large=false}:{id:string;alt:string;large?:boolean}) {
 const [failed,setFailed]=useState(false);
 return failed?<span className="album-image-error">照片暫時無法載入</span>:<img src={`/api/uri/photos/${encodeURIComponent(id)}`} alt={alt} loading={large?"eager":"lazy"} decoding="async" onError={()=>setFailed(true)}/>;
}

export default function AlbumDialog({entry,onClose,onRemove}:Props) {
 const photos=orderAlbumPhotos(entry.photos,entry.coverPhotoId);
 const [limit,setLimit]=useState(BATCH),[selected,setSelected]=useState<number|null>(null);
 const [selectMode,setSelectMode]=useState(false),[picked,setPicked]=useState<Set<string>>(()=>new Set()),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[message,setMessage]=useState("");
 const closeRef=useRef<HTMLButtonElement>(null),viewerCloseRef=useRef<HTMLButtonElement>(null),activeThumb=useRef<HTMLButtonElement>(null),thumbReturn=useRef<HTMLButtonElement|null>(null),lastFocused=useRef<HTMLElement|null>(null),touch=useRef<{x:number;y:number}|null>(null);
 const count=photos.length;
 useEffect(()=>{setPicked(current=>{const available=new Set(entry.photos),remaining=[...current].filter(id=>available.has(id));return remaining.length===current.size?current:new Set(remaining);});},[entry.photos]);
 const move=(direction:number)=>setSelected(value=>value===null||!count?value:stepAlbumIndex(value,direction,count));
 useEffect(()=>{
  lastFocused.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const previous=document.body.style.overflow;document.body.style.overflow="hidden";closeRef.current?.focus();
  return ()=>{document.body.style.overflow=previous;lastFocused.current?.focus();};
 },[]);
 const viewerOpen=selected!==null;
 useEffect(()=>{if(viewerOpen)viewerCloseRef.current?.focus();},[viewerOpen]);
 useEffect(()=>{if(selected!==null)activeThumb.current?.scrollIntoView({block:"nearest",inline:"nearest"});},[selected]);
 function closeViewer(){setSelected(null);requestAnimationFrame(()=>thumbReturn.current?.focus());}
 function keyDown(event:React.KeyboardEvent<HTMLElement>){
  if(event.key==="Escape"){event.preventDefault();event.stopPropagation();if(busy)return;if(selected!==null)closeViewer();else if(selectMode){setSelectMode(false);setPicked(new Set());}else onClose();return;}
  if(selected!==null&&(event.key==="ArrowLeft"||event.key==="ArrowRight")){event.preventDefault();move(event.key==="ArrowLeft"?-1:1);return;}
  if(event.key!=="Tab")return;
  const container=selected===null?event.currentTarget.querySelector<HTMLElement>(".album-dialog"):event.currentTarget.querySelector<HTMLElement>(".album-viewer");
  const buttons=Array.from(container?.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],[tabindex]:not([tabindex='-1'])")||[]).filter(el=>el.getClientRects().length>0);
  if(!buttons.length){event.preventDefault();return;}
  const first=buttons[0],last=buttons[buttons.length-1];
  if(event.shiftKey&&(document.activeElement===first||!container?.contains(document.activeElement))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!container?.contains(document.activeElement))){event.preventDefault();first.focus();}
 }
 function togglePhoto(id:string){setPicked(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});}
 async function removeSelected(){
  const ids=photos.filter(id=>picked.has(id));if(!ids.length||busy)return;
  const coverNotice=entry.coverPhotoId&&picked.has(entry.coverPhotoId)?"\n所選照片包含封面，會自動改用其他照片。":"";
  if(!window.confirm(`將選取的 ${ids.length} 張照片移到回收桶？雙方都可以還原。${coverNotice}`))return;
  setBusy(true);setProgress(0);setMessage("");
  try{const result=await onRemove(entry.id,ids,setProgress);setPicked(new Set());setSelectMode(false);setMessage(`已將 ${result.removed} 張照片移到回收桶。${result.removed<result.processed?`其餘 ${result.processed-result.removed} 張可能已被移除。`:""}`);}
  catch(error){setMessage(error instanceof Error?error.message:"處理失敗，請稍後再試。");}
  finally{setBusy(false);}
 }
 return <div className="album-overlay" onKeyDown={keyDown}>
  <section className="album-dialog" role="dialog" aria-modal={selected===null?"true":undefined} aria-labelledby="album-heading" inert={selected!==null||undefined}>
   <div className="album-header"><div><span className="uri-eyebrow">OUR MEMORIES</span><h2 id="album-heading">{entry.title}</h2><p>{dateText(entry.startDate)}{entry.endDate?` — ${dateText(entry.endDate)}`:""} · {count} 張照片</p></div><button ref={closeRef} type="button" className="album-close" aria-label="關閉相簿" disabled={busy} onClick={onClose}><CloseIcon/></button></div>
   {entry.body&&<p className="album-description">{entry.body}</p>}
   <p className="album-author">由 {entry.author} 留下</p>
   {message&&<p className="album-feedback" role="status">{message}</p>}
   {count>0&&<div className="album-select-heading"><button type="button" className="album-select-toggle" disabled={busy} onClick={()=>{setSelectMode(value=>!value);setPicked(new Set());setMessage("");}}>{selectMode?"完成選取":"選取照片"}</button></div>}
   {count===0?<p className="album-empty">這則回憶目前沒有照片，可以在編輯內容時再加入。</p>:<div className="album-grid">{photos.slice(0,limit).map((id,index)=><button type="button" key={id} className={`album-tile${selectMode?" is-selectable":""}`} aria-label={`${selectMode?"選取":"查看"}第 ${index+1} 張照片`} aria-pressed={selectMode?picked.has(id):undefined} disabled={busy} onClick={event=>{if(selectMode)togglePhoto(id);else{thumbReturn.current=event.currentTarget;setSelected(index);}}}><Photo id={id} alt=""/>{selectMode&&<span className="album-check" aria-hidden="true">{picked.has(id)&&<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L19 7"/></svg>}</span>}</button>)}</div>}
   {limit<count&&<button type="button" className="album-more" disabled={busy} onClick={()=>setLimit(value=>value+BATCH)}>載入更多照片（還有 {count-limit} 張）</button>}
   {selectMode&&<div className="album-selection-bar"><span aria-live="polite">已選 {picked.size} / {count} 張{busy?` · 已處理 ${progress} 張`:""}</span><div><button type="button" disabled={busy} onClick={()=>setPicked(picked.size===count?new Set():new Set(photos))}>{picked.size===count?"取消全選":`全選 ${count} 張`}</button><button type="button" className="album-remove-selected" disabled={busy||picked.size===0} onClick={removeSelected}>{busy?"正在移除…":"移到回收桶"}</button></div></div>}
  </section>
  {selected!==null&&photos[selected]&&<section className="album-viewer" role="dialog" aria-modal="true" aria-label={`${entry.title} 的照片檢視`}>
   <header className="album-viewer-head"><div><strong>{entry.title}</strong><span aria-live="polite">{selected+1} / {count}</span></div><button type="button" ref={viewerCloseRef} className="album-close" aria-label="返回相簿" onClick={closeViewer}><CloseIcon/></button></header>
   <div className="album-stage" onTouchStart={event=>{if(event.touches.length===1)touch.current={x:event.touches[0].clientX,y:event.touches[0].clientY};else touch.current=null;}} onTouchEnd={event=>{const start=touch.current;touch.current=null;if(!start||event.changedTouches.length!==1)return;const dx=event.changedTouches[0].clientX-start.x,dy=event.changedTouches[0].clientY-start.y;const direction=albumSwipe(dx,dy);if(direction)move(direction);}}>
    {count>1&&<button type="button" className="viewer-arrow viewer-prev" aria-label="上一張照片" onClick={()=>move(-1)}><ArrowIcon direction="left"/></button>}
    <div className="album-stage-image"><Photo key={photos[selected]} id={photos[selected]} alt={`${entry.title}，第 ${selected+1} 張照片`} large/></div>
    {count>1&&<button type="button" className="viewer-arrow viewer-next" aria-label="下一張照片" onClick={()=>move(1)}><ArrowIcon direction="right"/></button>}
   </div>
   {count>1&&<div className="album-filmstrip" aria-label="照片縮圖">{photos.map((id,index)=><button type="button" key={id} ref={index===selected?activeThumb:undefined} aria-label={`切換到第 ${index+1} 張照片`} aria-pressed={index===selected} onClick={()=>setSelected(index)}><Photo id={id} alt=""/></button>)}</div>}
  </section>}
 </div>;
}
