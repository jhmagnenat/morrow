import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseOcrTsv} from '@/lib/pdfLayout';

export async function recognizePdfImage(dataUrl:string){
  const binary=process.env.MORROW_OCR_BINARY;if(!binary)return undefined;
  const language=process.env.MORROW_OCR_LANGUAGES??'eng';
  if(!/^[a-zA-Z0-9_+]+$/.test(language))throw Error('Invalid OCR languages');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'morrow-ocr-'));
  try{
    const file=path.join(directory,'page.png');await fs.writeFile(file,Buffer.from(dataUrl.split(',')[1],'base64'));
    const {stdout}=await promisify(execFile)(binary,[file,'stdout','-l',language,'tsv'],{timeout:45000,maxBuffer:16*1024*1024,windowsHide:true});
    return parseOcrTsv(stdout);
  }finally{
    const resolved=path.resolve(directory);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Invalid OCR temporary directory');
    await fs.rm(resolved,{recursive:true,force:true});
  }
}
