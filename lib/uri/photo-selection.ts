// File references are queued without a fixed count; previews are rendered lazily.
export function createPendingPhotos<T>(files:ArrayLike<T>,makeId:()=>string):Array<{id:string;file:T}> {
  return Array.from(files,file=>({id:makeId(),file}));
}
