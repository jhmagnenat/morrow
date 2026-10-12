import path from 'node:path';
import {currentUser} from '@/lib/identityScope';
// An explicit data root lets integration/browser checks use disposable courses.
export function baseDataDirectory(){return path.resolve(/* turbopackIgnore: true */ process.env.MORROW_DATA_DIR??path.join(process.cwd(),'data'));}
export function dataDirectory(){
  const user=currentUser(),root=baseDataDirectory();
  if(!user||user.storageId==='local')return root;
  if(!/^[a-f0-9-]{36}$/.test(user.storageId))throw Error('Invalid user workspace');
  return path.join(root,'users',user.storageId);
}
