type ArrowProps={direction:"left"|"right";style?:"chevron"|"arrow"};
export function ArrowIcon({direction,style="chevron"}:ArrowProps) {
 const path=style==="arrow"?"M19 12H5 M11 6l-6 6 6 6":"M15.5 5L8.5 12l7 7";
 return <svg className={`uri-icon${direction==="right"?" uri-icon-right":""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={path}/></svg>;
}
export function CloseIcon() {
 return <svg className="uri-icon uri-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>;
}
