export const PHOTO_TRASH_BATCH_SIZE=80;
export function splitPhotoBatches<T>(values:T[]):T[][] {
 const batches:T[][]=[];
 for(let offset=0;offset<values.length;offset+=PHOTO_TRASH_BATCH_SIZE)batches.push(values.slice(offset,offset+PHOTO_TRASH_BATCH_SIZE));
 return batches;
}
