import type {CardDetail} from '@/lib/types';
import type {SourceSnippet} from '@/lib/sourceCatalog';
export interface GenerationOptions {mode:'strict'|'open';enrichment:boolean;cardDetail?:CardDetail;claimId?:string;skipRetried?:boolean;pages?:number[];onProgress?:(page:number,stage:string)=>void;}
export interface GenerationSource {documentId:string;title:string;pdfSha256?:string;reviewerLabel?:string;courseOutline?:string;layouts?:Array<{page:number;width:number;height:number;blocks:Array<{text:string;x:number;y:number;width:number;height:number}>}>;revision:string;primaryPages:number[];snippets:SourceSnippet[];imagePages:number[];images:string[];uncertainOcrPages:number[];}
export interface GenerationModel {
  complete<T>(system:string,input:unknown,tool:string,description:string,schema:Record<string,unknown>,images:string[]):Promise<T>;
}
