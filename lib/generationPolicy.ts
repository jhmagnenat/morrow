export function fastGeneration(){return process.env.MORROW_GENERATION_PIPELINE!=='detailed';}
export function directGeneration(){return !['progressive','detailed','fast'].includes(process.env.MORROW_GENERATION_PIPELINE??'direct');}
export function progressiveGeneration(){return !['detailed','fast'].includes(process.env.MORROW_GENERATION_PIPELINE??'progressive');}
export function generationConcurrency(){
 const configured=Number(process.env.MORROW_GENERATION_CONCURRENCY);
 if(Number.isInteger(configured)&&configured>=1&&configured<=4)return configured;
 return process.env.LLM_PROVIDER==='ollama'||!process.env.OPENAI_API_KEY&&!process.env.ANTHROPIC_API_KEY?1:3;
}
// Preserve primary pages in full. Retrieve a small number of relevant source
// pages instead of repeating a whole PDF in every generation and audit call.
export function relevantContext(primary:number[],passages:Array<{page:number;text:string}>,limit=4,maxCharacters:number|null=2500){
 const pages=new Map<number,string>();for(const p of passages)pages.set(p.page,(pages.get(p.page)??'')+'\n'+p.text);
 const terms=(text:string)=>new Set(text.toLowerCase().match(/[a-zà-ÿ][a-zà-ÿ0-9]{3,}/g)??[]);
 const query=terms(primary.map(p=>pages.get(p)??'').join('\n'));
 return [...pages].filter(([p])=>!primary.includes(p)).map(([page,text])=>({page,text,score:[...terms(text)].filter(t=>query.has(t)).length+(primary.some(p=>Math.abs(p-page)===1)?4:0)})).sort((a,b)=>b.score-a.score||a.page-b.page).slice(0,limit).map(({page,text})=>({page,text:maxCharacters===null?text:text.slice(0,maxCharacters)}));
}
