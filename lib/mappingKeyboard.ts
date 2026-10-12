export function mappingKeyboardTarget(ids:string[],selected:string|null,key:string,columns:number):string|undefined {
  if(!ids.length)return;
  const index=selected?ids.indexOf(selected):-1;
  if(index<0)return ids[0];
  const width=Math.max(1,columns);
  const delta=key==='ArrowRight'?1:key==='ArrowLeft'?-1:key==='ArrowDown'?width:key==='ArrowUp'?-width:0;
  if(!delta)return;
  const next=index+delta;
  if(next<0 || next>=ids.length) {
    // In an incomplete final row, Down chooses its nearest remaining cell.
    if(key==='ArrowDown' && Math.floor(index/width)<Math.floor((ids.length-1)/width))return ids.at(-1);
    return;
  }
  return ids[next];
}
