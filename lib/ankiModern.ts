import {zstdDecompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';

// Bounded wire decoding for the published Anki metadata/config messages.
// Unknown fields are skipped; no executable templates or package code run.
export function protobuf(bytes:Uint8Array):Map<number,Array<number|Buffer>>{
  const data=Buffer.from(bytes),fields=new Map<number,Array<number|Buffer>>();let offset=0;
  const integer=()=>{let value=BigInt(0);for(let shift=BigInt(0);shift<BigInt(70);shift+=BigInt(7)){if(offset>=data.length)throw Error('Truncated Anki protobuf');const byte=data[offset++];value|=BigInt(byte&127)<<shift;if(!(byte&128)){if(value>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Oversized Anki protobuf integer');return Number(value);}}throw Error('Invalid Anki protobuf integer');};
  while(offset<data.length){
    const tag=integer(),field=tag>>>3,wire=tag&7;if(!field)throw Error('Invalid Anki protobuf field');
    let value:number|Buffer;
    if(wire===0)value=integer();
    else if(wire===2){const length=integer();if(length>data.length-offset)throw Error('Truncated Anki protobuf field');value=data.subarray(offset,offset+length);offset+=length;}
    else if(wire===1||wire===5){offset+=wire===1?8:4;if(offset>data.length)throw Error('Truncated Anki protobuf');continue;}
    else throw Error('Unsupported Anki protobuf wire type');
    const values=fields.get(field)??[];values.push(value);fields.set(field,values);
    if(values.length>50000||fields.size>4096)throw Error('Anki protobuf limit exceeded');
  }
  return fields;
}
const text=(fields:ReturnType<typeof protobuf>,field:number)=>{
  const value=fields.get(field)?.[0];return Buffer.isBuffer(value)?value.toString('utf8'):'';
};
export function modernAnkiFiles(files:Map<string,Buffer>){
  const meta=files.get('meta');
  if(!meta||protobuf(meta).get(1)?.[0]!==3)throw Error('Invalid modern Anki metadata; export with support for older versions if unsupported');
  let remaining=256*1024*1024;
  const decode=(bytes:Buffer)=>{const result=zstdDecompressSync(bytes,{maxOutputLength:remaining});remaining-=result.length;if(remaining<=0)throw Error('Anki decompression limit exceeded');return result;};
  const collection=decode(files.get('collection.anki21b')!);
  const map=files.get('media'),entries=map?protobuf(decode(map)).get(1)??[]:[];
  const names=new Set<string>();
  const media=entries.map((entry,index)=>{
    if(!Buffer.isBuffer(entry))throw Error('Invalid modern Anki media entry');
    const fields=protobuf(entry),name=text(fields,1),size=fields.get(2)?.[0]??0,sha=fields.get(3)?.[0];
    if(!name||/[\/\\\0]/.test(name)||name==='.'||name==='..'||name.length>240||names.has(name)||name!==name.normalize('NFC'))throw Error('Invalid Anki media filename');names.add(name);
    const original=files.get(String(index));if(!original)throw Error('Missing modern Anki media');
    const bytes=decode(original);
    if(bytes.length!==size||!Buffer.isBuffer(sha)||sha.length!==20||!createHash('sha1').update(bytes).digest().equals(sha))throw Error('Modern Anki media checksum mismatch');
    return {name,bytes};
  });
  return {collection,media};
}
export function modernAnkiModels(db:DatabaseSync){
  const fields=db.prepare('SELECT ntid,ord,name FROM fields ORDER BY ntid,ord').all();
  const templates=db.prepare('SELECT ntid,ord,config FROM templates ORDER BY ntid,ord').all();
  const models=Object.fromEntries(db.prepare('SELECT id,name,config FROM notetypes').all().map(row=>{
    const config=protobuf(row.config as Uint8Array),kind=config.get(1)?.[0]??0;
    if(kind!==0&&kind!==1)throw Error('Unsupported Anki notetype kind');
    return [String(row.id),{name:String(row.name),type:Number(kind),flds:fields.filter(f=>f.ntid===row.id).map(f=>({name:String(f.name),ord:Number(f.ord)})),tmpls:templates.filter(t=>t.ntid===row.id).map(t=>{
      const config=protobuf(t.config as Uint8Array);return {ord:Number(t.ord),qfmt:text(config,1),afmt:text(config,2)};
    })}];
  }));
  const decks=Object.fromEntries(db.prepare('SELECT id,name FROM decks').all().map(row=>[String(row.id),{name:String(row.name).replace(/\x1f/g,'::')}]));
  return {models,decks};
}
