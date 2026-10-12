import {AsyncLocalStorage} from 'node:async_hooks';
export interface WorkspaceUser {id:string;name:string;storageId:string;}
declare global {var __identityScope:AsyncLocalStorage<WorkspaceUser>|undefined;}
const scope=globalThis.__identityScope??=new AsyncLocalStorage<WorkspaceUser>();
export const currentUser=()=>scope.getStore();
export const withUser=<T>(user:WorkspaceUser|undefined,work:()=>T)=>scope.run(user as WorkspaceUser,work);
