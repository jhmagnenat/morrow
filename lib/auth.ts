import {randomBytes,randomUUID,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {baseDataDirectory} from '@/lib/dataDirectory';
import type {WorkspaceUser} from '@/lib/identityScope';
export const authEnabled=()=>process.env.MORROW_AUTH==='required';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
declare global {var __authDbs:Map<string,DatabaseSync>|undefined;}
function database(){
  const file=path.join(baseDataDirectory(),'identity.db'),cache=globalThis.__authDbs??=new Map<string,DatabaseSync>();
  const existing=cache.get(file);if(existing)return existing;
  fs.mkdirSync(path.dirname(file),{recursive:true});const db=new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,storage_id TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_attempts(name_hash TEXT PRIMARY KEY,count INTEGER NOT NULL,until_at INTEGER NOT NULL);`);
  cache.set(file,db);return db;
}
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:16384,r:8,p:1},(error,key)=>error?reject(error):resolve(key)));
export async function provisionUser(name:string,password:string,owner=false){
  name=name.trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9_.@-]{2,79}$/.test(name)||password.length<14||password.length>256)throw Error('Use a valid 3–80 character account name and a 14–256 character password');
  const salt=randomBytes(32).toString('hex'),encoded=(await derive(password,salt)).toString('hex'),id=randomUUID(),storageId=owner?'local':id;
  database().prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,name,storageId,salt,encoded);
  return {id,name,storageId};
}
export function listUsers():WorkspaceUser[]{return database().prepare('SELECT id,name,storage_id storageId FROM users').all() as unknown as WorkspaceUser[];}
export function sessionUser(token:string|undefined):WorkspaceUser|undefined{
  if(!token||!/^[a-f0-9]{64}$/.test(token))return;
  return database().prepare('SELECT users.id,name,storage_id storageId FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(hash(token),Date.now()) as unknown as WorkspaceUser|undefined;
}
export function requestUser(request:Request){
  const token=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('morrow-session='))?.slice(15);
  return sessionUser(token);
}
export async function login(name:string,password:string){
  if(typeof name!=='string'||typeof password!=='string'||name.length>80||password.length>256)throw Error('Invalid account or password');
  name=name.trim().toLowerCase();const db=database(),key=hash(name),now=Date.now();
  db.prepare('DELETE FROM login_attempts WHERE until_at<=?').run(now);
  const globalKey='global-login-budget';
  const budget=db.prepare('SELECT count,until_at FROM login_attempts WHERE name_hash=?').get(globalKey);
  if(budget&&Number(budget.until_at)>now&&Number(budget.count)>=60)throw Error('Too many attempts; try again in a minute');
  db.prepare('INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(name_hash) DO UPDATE SET count=count+1').run(globalKey,now+60000);
  const attempt=db.prepare('SELECT count,until_at FROM login_attempts WHERE name_hash=?').get(key);
  if(attempt&&Number(attempt.until_at)>now&&Number(attempt.count)>=8)throw Error('Too many attempts; try again in 15 minutes');
  // Reserve the attempt before asynchronous hashing, so parallel requests
  // cannot bypass the limit. Unknown accounts perform the same derivation.
  db.prepare('INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(name_hash) DO UPDATE SET count=CASE WHEN until_at<=? THEN 1 ELSE count+1 END,until_at=CASE WHEN until_at<=? THEN excluded.until_at ELSE until_at END').run(key,now+15*60000,now,now);
  const row=db.prepare('SELECT * FROM users WHERE name=?').get(name);
  const candidate=await derive(password,String(row?.salt??'0'.repeat(64)));
  const expected=Buffer.from(String(row?.password_hash??'0'.repeat(128)),'hex');
  if(!timingSafeEqual(candidate,expected)||!row)throw Error('Invalid account or password');
  db.prepare('DELETE FROM login_attempts WHERE name_hash=? OR until_at<=?').run(key,now);
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
  const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),row.id,now+30*86400000);
  return {token,user:{id:String(row.id),name:String(row.name),storageId:String(row.storage_id)}};
}
export function logout(token:string){database().prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));}
