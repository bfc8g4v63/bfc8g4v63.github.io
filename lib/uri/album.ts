export function orderAlbumPhotos(photos:string[],cover:string|null):string[] {
 const chosen=cover&&photos.includes(cover)?cover:photos[0];
 return chosen?[chosen,...photos.filter(id=>id!==chosen)]:[];
}
export function stepAlbumIndex(index:number,direction:number,count:number):number {
 if(count<=0)return 0;
 return ((index+direction)%count+count)%count;
}
export function albumSwipe(dx:number,dy:number):number {
 return Math.abs(dx)>=50&&Math.abs(dx)>Math.abs(dy)*1.3?(dx<0?1:-1):0;
}
