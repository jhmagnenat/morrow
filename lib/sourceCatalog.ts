export interface SourceSnippet {id:string;page:number;text:string;}
// Non-overlapping slices retain every source character. No semantic fact is
// reconstructed by a model, and citations are materialized by the server.
export function sourceCatalog(pages:Array<{page:number;text:string}>):SourceSnippet[]{
  return pages.flatMap(({page,text})=>{
    const snippets:SourceSnippet[]=[];
    let start=0;
    while(start<text.length){
      let end=Math.min(text.length,start+1000);
      if(end<text.length){
        // Prefer complete source lines/paragraphs, then sentence boundaries.
        // Never erase a table row boundary or split a decimal at its dot.
        const line=text.lastIndexOf('\n',end);
        const sentences=[...text.slice(start,end).matchAll(/[.!?](?:[ \t]+|\r?\n)(?=\p{Lu})/gu)];
        const sentence=sentences.at(-1);
        const boundary=line>start+500?line+1:sentence&&sentence.index>500?start+sentence.index+sentence[0].length:undefined;
        if(boundary!==undefined)end=boundary;
        else{const candidate=text.lastIndexOf(' ',end);if(candidate>start+500)end=candidate+1;}
      }
      snippets.push({id:`p${page}s${snippets.length}`,page,text:text.slice(start,end)});start=end;
    }
    return snippets;
  });
}
export function resolveSourceIds(sources:Array<{sourceId:string}>,catalog:SourceSnippet[]):Array<{page:number;quote:string}>{
  const byId=new Map(catalog.map(s=>[s.id,s]));
  if(!Array.isArray(sources)||!sources.length)throw Error('Missing source-snippet evidence');
  return [...new Set(sources.map(s=>s.sourceId))].map(id=>{
    const snippet=byId.get(id);
    if(!snippet||snippet.text.trim().length<12)throw Error('Unknown or insufficient source-snippet evidence');
    return {page:snippet.page,quote:snippet.text};
  });
}
