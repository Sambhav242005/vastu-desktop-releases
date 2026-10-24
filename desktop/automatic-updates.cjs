/** Startup checks, network recovery and guarded automatic restart. */
function startAutomaticUpdates({updates, canRestart=async()=>true, log=()=>{}, now=Date.now, setTimer=setTimeout, clearTimer=clearTimeout}) {
  let stopped=false,timer,nextCheck=0,lastAttempt=-Infinity,readyAt=null,nextInstall=0;
  async function tick(){
    if(stopped)return;
    try{
      const state=updates.getState(),time=now();
      if(updates.canInstall()){
        if(readyAt===null)readyAt=time;
        if(time>=readyAt+15000&&time>=nextInstall){
          if(await canRestart()){nextInstall=time+60000;await updates.install(true);}
        }
      }else{
        readyAt=null;
        if(time>=nextCheck||(state.status==='error'&&time>=lastAttempt+60000)){
          nextCheck=time+60000;
          lastAttempt=time;
          if(state.status==='available'||(state.status==='error'&&state.retry==='download'))await updates.download();
          else if(['idle','upToDate','error'].includes(state.status)){
            await updates.check();
            if(updates.getState().status==='upToDate')nextCheck=time+15*60000;
          }
        }
      }
    }catch(error){log(`Automatic update deferred: ${error.message}`);}
    finally{if(!stopped){timer=setTimer(()=>{void tick();},5000);timer?.unref?.();}}
  }
  void tick();
  return ()=>{stopped=true;clearTimer(timer);};
}
module.exports={startAutomaticUpdates};
