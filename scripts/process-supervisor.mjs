import {spawn} from 'node:child_process';

// The worker is a separate child so an exhausted or crashed generation
// process cannot take the HTTP server down. Restart delay is bounded.
export function superviseProcess(command,args,{env=process.env,cwd=process.cwd(),stdio='inherit',minimumDelay=1000,maximumDelay=30000,onRestart=()=>{},onStart=()=>{}}={}){
  let child,closed=false,timer,failures=0,startedAt;
  const launch=()=>{
    if(closed)return;
    startedAt=Date.now();
    child=spawn(command,args,{env,cwd,stdio,windowsHide:true});
    child.once('spawn',()=>onStart({pid:child.pid}));
    let handled=false;
    const exited=(code,signal,error)=>{
      if(handled)return;handled=true;
      if(closed)return;
      failures=Date.now()-startedAt>60000?0:failures+1;
      const delay=Math.min(maximumDelay,minimumDelay*2**Math.min(failures-1,10));
      onRestart({code,signal,error,delay});timer=setTimeout(launch,delay);
    };
    child.once('error',error=>exited(null,null,error));child.once('exit',(code,signal)=>exited(code,signal));
  };
  launch();
  return {
    get pid(){return child?.pid;},
    async close(){
      closed=true;clearTimeout(timer);
      if(!child||child.exitCode!==null||child.signalCode!==null||!child.pid)return;
      const current=child;
      await new Promise(resolve=>{
        const force=setTimeout(()=>current.kill('SIGKILL'),5000);
        current.once('exit',()=>{clearTimeout(force);resolve();});
        current.kill('SIGTERM');
      });
    },
  };
}
