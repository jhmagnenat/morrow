import {openDb} from '@/lib/db';
import {createRecoveryPoint} from '@/lib/recovery';
import {optimizeScheduler} from '@/lib/schedulerMaintenance';
export async function reviewMaintenance(){
  try{createRecoveryPoint('periodic-review',true);await optimizeScheduler();openDb().prepare("DELETE FROM quality_settings WHERE key='maintenance-error'").run();}
  catch(error){openDb().prepare("INSERT INTO quality_settings VALUES('maintenance-error',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({at:new Date().toISOString(),message:error instanceof Error?error.message:'Review maintenance failed'}));}
}
