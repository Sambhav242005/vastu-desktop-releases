const {test}=require('node:test'),assert=require('node:assert/strict');
const {startAutomaticUpdates}=require('../automatic-updates.cjs');
function fixture(){
 let time=0,callback,state={status:'idle'},safe=true;const calls=[];
 const updates={getState:()=>state,canInstall:()=>state.status==='ready'||state.retry==='install',check:async()=>{calls.push('check');state={status:'upToDate'};},download:async()=>{calls.push('download');state={status:'downloading'};},install:async relaunch=>{calls.push(['install',relaunch]);state={status:'installing'};}};
 const stop=startAutomaticUpdates({updates,canRestart:async()=>safe,now:()=>time,setTimer:fn=>{callback=fn;return 1;},clearTimer:()=>{callback=null;}});
 return {calls,updates,stop,setState:value=>{state=value;},safe:value=>{safe=value;},step:async delta=>{await new Promise(setImmediate);time+=delta;callback?.();await new Promise(setImmediate);}};
}
test('checks immediately at startup and checks again after fifteen minutes',async()=>{
 const f=fixture();await f.step(0);assert.deepEqual(f.calls,['check']);await f.step(60000);assert.deepEqual(f.calls,['check']);await f.step(840000);assert.deepEqual(f.calls,['check','check']);f.stop();
});
test('offline startup and failed downloads recover automatically after one minute',async()=>{
 const f=fixture();await f.step(0);f.setState({status:'error',retry:'check'});await f.step(900000);assert.equal(f.calls.at(-1),'check');
 f.setState({status:'error',retry:'download'});await f.step(60000);assert.equal(f.calls.at(-1),'download');f.stop();
});
test('ready update restarts automatically, but open draft delays it without discarding the update',async()=>{
 const f=fixture();await f.step(0);f.setState({status:'ready'});await f.step(5000);await f.step(10000);assert.equal(f.calls.length,1);
 f.safe(false);await f.step(5000);assert.equal(f.calls.length,1);
 f.safe(true);await f.step(60000);assert.deepEqual(f.calls.at(-1),['install',true]);await f.step(5000);assert.equal(f.calls.length,2);f.stop();
});
test('failed save/install is retried without manual action and stop cancels scheduling',async()=>{
 const f=fixture();await f.step(0);f.setState({status:'ready'});await f.step(5000);f.updates.install=async()=>{f.calls.push('blocked');f.setState({status:'error',retry:'install'});};
 await f.step(15000);assert.equal(f.calls.at(-1),'blocked');await f.step(60000);assert.equal(f.calls.filter(v=>v==='blocked').length,2);f.stop();await f.step(60000);assert.equal(f.calls.filter(v=>v==='blocked').length,2);
});
