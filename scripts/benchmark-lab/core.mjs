import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID,randomInt} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

export const ROOT=path.resolve(import.meta.dirname,'../..');
export const LAB=path.resolve(process.env.MORROW_BENCHMARK_DIR??path.join(ROOT,'data','benchmark-lab'));
export const VERSION='benchmark-lab-v1';
export const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export async function readJson(file){return JSON.parse(await fs.readFile(file,'utf8'));}
export async function writeJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const temporary=`${file}.${randomUUID()}.tmp`;await fs.writeFile(temporary,JSON.stringify(value,null,2),{flag:'wx'});await fs.rename(temporary,file);}
export function experimentDir(id){if(!/^[a-z0-9-]{1,90}$/.test(id))throw Error('Invalid experiment ID');return path.join(LAB,'experiments',id);}
export async function reusableModules(){
  // Only pure PDF/schema helpers. Never import MORROW's generator or database.
  const directory=path.join(ROOT,'.next','benchmark-lab-runtime');await fs.mkdir(directory,{recursive:true});
  for(const name of ['pdf','pdfLayout','pdfOcr','structuredSchema']){
    const source=await fs.readFile(path.join(ROOT,'lib',`${name}.ts`),'utf8');
    const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
    await fs.writeFile(path.join(directory,`${name}.mjs`),outputText.replace(/@\/lib\/([a-zA-Z]+)/g,'./$1.mjs'));
  }
  return {pdf:await import(pathToFileURL(path.join(directory,'pdf.mjs')).href),schema:await import(pathToFileURL(path.join(directory,'structuredSchema.mjs')).href)};
}
export const DEFAULT_CONFIG={model:'gpt-4o-2024-11-20',temperature:0,seed:17,pagesPerBatch:2,cardsPerBatch:8,maxOutputTokens:4096,maxInputTokenBound:24000,timeoutMs:60000,
  rates:{input:2.5,cachedInput:1.25,output:10,verifiedAt:'2026-10-10',source:'https://developers.openai.com/api/docs/models/gpt-4o'}};
export function validateConfig(c){
  if(!/^gpt-4o(?:-2024-(?:08-06|11-20))?$/.test(c.model))throw Error('Initial controlled comparison supports GPT-4o snapshots only; other models need explicit image pricing support.');
  if(!Number.isFinite(c.temperature)||c.temperature<0||c.temperature>2||!Number.isInteger(c.seed)||c.seed<0||c.seed>2147483647||!Number.isInteger(c.timeoutMs)||c.timeoutMs<1000||c.timeoutMs>600000)throw Error('Invalid shared model parameters');
  for(const [key,min,max] of [['pagesPerBatch',1,4],['cardsPerBatch',1,16],['maxOutputTokens',512,8192],['maxInputTokenBound',4096,100000]])if(!Number.isInteger(c[key])||c[key]<min||c[key]>max)throw Error(`Invalid ${key}`);
  for(const key of ['input','cachedInput','output'])if(!Number.isFinite(c.rates[key])||c.rates[key]<0)throw Error('Invalid token price');
}
export function imageTokens(width,height){const fit=Math.min(1,2048/Math.max(width,height));width*=fit;height*=fit;const scale=768/Math.min(width,height);return 85+170*Math.ceil(width*scale/512)*Math.ceil(height*scale/512);}
export async function prepareDocument(pdfFile,{pages,config={}}={}){
  const started=Date.now(),bytes=await fs.readFile(pdfFile);
  if(bytes.length>128*1024*1024||!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('Expected a PDF no larger than 128 MiB');
  const settings={...DEFAULT_CONFIG,...config,rates:{...DEFAULT_CONFIG.rates,...config.rates}};validateConfig(settings);
  const {pdf}=await reusableModules();
  const extracted=await pdf.extractPdfPages(Uint8Array.from(bytes).buffer);
  const selected=pages??extracted.map(p=>p.page);
  if(!selected.length||selected.some(p=>!Number.isInteger(p)||p<1||p>extracted.length)||new Set(selected).size!==selected.length)throw Error('Invalid or duplicate selected PDF pages');
  const id=`${new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14)}-${randomUUID().slice(0,8)}`,directory=experimentDir(id);
  await fs.mkdir(path.join(directory,'images'),{recursive:true});await fs.writeFile(path.join(directory,'source.pdf'),bytes,{flag:'wx'});
  const frozen=[];
  for(const number of [...selected].sort((a,b)=>a-b)){
    const extractedPage=extracted[number-1],url=await pdf.renderPdfPageAsDataUrl(Buffer.from(bytes),number),png=Buffer.from(url.split(',')[1],'base64');
    const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
    await fs.writeFile(path.join(directory,'images',`${number}.png`),png,{flag:'wx'});
    frozen.push({page:number,text:extractedPage.text,layout:extractedPage.layout,imageSha256:hash(png),width,height,imageTokens:imageTokens(width,height)});
  }
  const document={name:path.basename(pdfFile),sha256:hash(bytes),pageCount:extracted.length,pages:frozen};
  const manifest={id,version:VERSION,createdAt:new Date().toISOString(),preparationMs:Date.now()-started,document,config:settings};
  await writeJson(path.join(directory,'manifest.json'),manifest);
  const gold={version:1,validated:false,items:frozen.map(p=>({id:`K-${p.page}`,statement:'',pages:[p.page],essential:true}))};
  await writeJson(path.join(directory,'gold.json'),gold);
  return manifest;
}
export function batches(manifest){const out=[];for(let i=0;i<manifest.document.pages.length;i+=manifest.config.pagesPerBatch)out.push(manifest.document.pages.slice(i,i+manifest.config.pagesPerBatch));return out;}
export function shuffled(values){const out=[...values];for(let i=out.length-1;i>0;i--){const j=randomInt(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
export function validateGold(gold,manifest){
  if(!gold||!Array.isArray(gold.items)||typeof gold.validated!=='boolean'||gold.items.length>500)throw Error('Invalid essential-knowledge list');
  const ids=new Set();for(const item of gold.items){if(typeof item.id!=='string'||!item.id.trim()||ids.has(item.id)||typeof item.statement!=='string'||item.statement.length>2000||typeof item.essential!=='boolean'||!Array.isArray(item.pages)||!item.pages.length||item.pages.some(p=>!manifest.document.pages.some(s=>s.page===p)))throw Error('Invalid knowledge ID, statement or source page');ids.add(item.id);}
  if(gold.validated&&(!gold.items.some(i=>i.essential)||gold.items.some(i=>!i.statement.trim())))throw Error('Fill the knowledge statements before validating the list');
}
export function provenanceIssues(refs,pages){
  if(!Array.isArray(refs)||!refs.length)return ['No source reference'];
  return refs.flatMap(ref=>{
    const page=pages.find(p=>p.page===ref.page);if(!page)return ['Reference outside the shared input batch'];
    const norm=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
    if(ref.quote?.trim())return norm(page.text).includes(norm(ref.quote))?[]:['Quotation not present in extracted source text'];
    const r=ref.region;
    return r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.001&&r.y+r.height<=1.001?[]:['Visual source needs a valid normalized bounding box'];
  });
}
