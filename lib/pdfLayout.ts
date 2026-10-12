export interface PdfTextBlock {id:string;text:string;x:number;y:number;width:number;height:number;fontSize:number;kind:'text'|'formula-candidate';confidence?:number;}
export interface PdfPageLayout {width:number;height:number;origin:'pdf'|'ocr';blocks:PdfTextBlock[];tableCandidates:string[][];requiresVisualReview:boolean;warnings:string[];}
// Re-evaluate stored layouts too: earlier imports did not flag detected tables/formulas.
export function requiresPdfVisualReview(layout?:Partial<PdfPageLayout>):boolean {
  return Boolean(layout&&(layout.requiresVisualReview||layout.origin==='ocr'||layout.tableCandidates?.length||layout.blocks?.some(block=>block.kind==='formula-candidate')));
}
export function pdfPageLayout(items:Array<{str:string;x:number;y:number;width:number;height:number;fontSize:number}>,width:number,height:number):PdfPageLayout{
  const blocks=items.filter(i=>i.str.trim()).map((i,index)=>({id:`B${index+1}`,text:i.str,x:i.x,y:height-i.y-i.height,width:i.width,height:i.height,fontSize:i.fontSize,kind:/[=∑∫√≤≥≠∂]|\b\w+\^\d+/.test(i.str)?'formula-candidate' as const:'text' as const}));
  const rows:Array<PdfTextBlock[]>=[];
  for(const block of [...blocks].sort((a,b)=>a.y-b.y||a.x-b.x)){
    let row=rows.find(r=>Math.abs(r[0].y-block.y)<Math.max(2,Math.min(r[0].height,block.height)*.35));
    if(!row){row=[];rows.push(row);}row.push(block);
  }
  const aligned=rows.filter(r=>r.length>=3&&r.some(b=>/\d/.test(b.text)));
  const tables=aligned.filter(row=>aligned.some(other=>other!==row&&row.filter(b=>other.some(c=>Math.abs(b.x-c.x)<6)).length>=3));
  const formulas=blocks.filter(b=>b.kind==='formula-candidate');
  const left=blocks.filter(b=>b.x<width*.35&&b.width<width*.45),right=blocks.filter(b=>b.x>width*.5&&b.width<width*.45);
  const columns=left.length>=2&&right.length>=2&&Math.max(Math.min(...left.map(b=>b.y)),Math.min(...right.map(b=>b.y)))<Math.min(Math.max(...left.map(b=>b.y+b.height)),Math.max(...right.map(b=>b.y+b.height)));
  return {width,height,origin:'pdf',blocks,tableCandidates:tables.map(row=>row.sort((a,b)=>a.x-b.x).map(b=>b.id)),requiresVisualReview:!blocks.length||tables.length>0||formulas.length>0||columns,
    warnings:[...(columns?['Multiple reading columns detected; raw PDF item order must be verified against the page image.']:[]),...(tables.length?['Aligned table cells detected; row and column semantics require source-image verification.']:[]),...(formulas.length?['Formula glyphs are preserved with coordinates; mathematical equivalence is not inferred.']:[])]};
}
export function parseOcrTsv(tsv:string):{text:string;layout:PdfPageLayout}{
  const blocks:PdfTextBlock[]=[],lines=new Map<string,string[]>();let width=0,height=0;
  for(const line of tsv.split(/\r?\n/).slice(1)){
    const cells=line.split('\t');if(cells.length<12)continue;
    const [level,page,block,paragraph,row,,x,y,w,h,confidence]=cells.slice(0,11).map(Number),text=cells.slice(11).join('\t').trim();
    if(![level,page,block,paragraph,row,x,y,w,h,confidence].every(Number.isFinite)||x<0||y<0||w<0||h<0)throw Error('Invalid OCR coordinates');
    if(level===1){width=w;height=h;}
    if(level!==5||!text)continue;
    if(confidence<0||confidence>100)throw Error('Invalid OCR confidence');
    blocks.push({id:`O${blocks.length+1}`,text,x,y,width:w,height:h,fontSize:h,kind:/[=∑∫√≤≥≠]/.test(text)?'formula-candidate':'text',confidence});
    const key=`${page}:${block}:${paragraph}:${row}`,words=lines.get(key)??[];words.push(text);lines.set(key,words);
  }
  if(!width||!height||blocks.length>100000)throw Error('Invalid or excessive OCR page');
  const uncertain=blocks.filter(b=>(b.confidence??0)<80||/\d/.test(b.text)&&(b.confidence??0)<90);
  return {text:[...lines.values()].map(words=>words.join(' ')).join('\n'),layout:{width,height,origin:'ocr',blocks,tableCandidates:[],requiresVisualReview:true,warnings:['OCR text must be checked against the original image.',...(uncertain.length?[`${uncertain.length} words or numbers have low OCR confidence.`]:[])]}};
}
