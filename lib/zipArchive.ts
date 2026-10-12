import {crc32,deflateRawSync,inflateRawSync} from 'node:zlib';

// Bounded in-memory ZIP transport. Never extracts user paths to disk.
export function readZip(bytes:Buffer,limit=256*1024*1024):Map<string,Buffer>{
  if(bytes.length>limit)throw Error('Archive exceeds the 256 MiB limit');
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
  if(end<0)throw Error('Invalid ZIP archive');
  const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);
  if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||count!==bytes.readUInt16LE(end+8)||count===65535||offset+size!==end)throw Error('Multi-volume and ZIP64 archives are unsupported');
  const files=new Map<string,Buffer>();let cursor=offset,total=0;
  for(let index=0;index<count;index++){
    if(cursor+46>end||bytes.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid ZIP directory');
    const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),checksum=bytes.readUInt32LE(cursor+16),packed=bytes.readUInt32LE(cursor+20),unpacked=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),local=bytes.readUInt32LE(cursor+42);
    const next=cursor+46+nameLength+extra+comment;if(next>end)throw Error('Truncated ZIP directory');
    const name=bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
    if(!name||name.includes('\0')||name.includes('\\')||name.startsWith('/')||name.split('/').some(p=>p==='..'||p==='.')||files.has(name)||flags&1||![0,8].includes(method))throw Error('Unsafe, duplicate, encrypted or unsupported ZIP entry');
    total+=unpacked;if(total>limit||unpacked>limit||local+30>offset||bytes.readUInt32LE(local)!==0x04034b50)throw Error('Invalid or oversized ZIP entry');
    const localNameLength=bytes.readUInt16LE(local+26),data=local+30+localNameLength+bytes.readUInt16LE(local+28);
    if(bytes.readUInt16LE(local+8)!==method||bytes.subarray(local+30,local+30+localNameLength).toString('utf8')!==name||data+packed>offset)throw Error('ZIP header mismatch');
    const input=bytes.subarray(data,data+packed),output=method===0?Buffer.from(input):inflateRawSync(input,{maxOutputLength:Math.max(1,unpacked)});
    if(output.length!==unpacked||crc32(output)!==checksum)throw Error('ZIP integrity check failed');
    files.set(name,output);cursor=next;
  }
  if(cursor!==end)throw Error('ZIP directory size mismatch');
  return files;
}

export function writeZip(files:Map<string,Buffer>):Buffer{
  const local:Buffer[]=[],central:Buffer[]=[];let offset=0;
  if(files.size>=65535)throw Error('Too many ZIP entries');
  for(const [name,bytes] of files){
    const filename=Buffer.from(name),packed=deflateRawSync(bytes),checksum=crc32(bytes),header=Buffer.alloc(30),directory=Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt32LE(checksum,14);header.writeUInt32LE(packed.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(filename.length,26);
    directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt32LE(checksum,16);directory.writeUInt32LE(packed.length,20);directory.writeUInt32LE(bytes.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);
    local.push(header,filename,packed);central.push(directory,filename);offset+=header.length+filename.length+packed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.size,8);end.writeUInt16LE(files.size,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
