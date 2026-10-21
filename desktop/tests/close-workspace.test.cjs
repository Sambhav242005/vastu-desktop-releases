const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createWorkspaceClose}=require('../close-workspace.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(overrides={}){
 const events=[];let allowed=false;
 const close=createWorkspaceClose({isAllowed:()=>allowed,allowClose:()=>{allowed=true;events.push('allow');},isSessionEnding:()=>false,getUpdates:()=>null,save:async()=>events.push('save'),close:()=>events.push('close'),onError:error=>events.push(error.message),...overrides});
 return {events,fire:()=>close({preventDefault:()=>events.push('prevent')}),isAllowed:()=>allowed};
}
test('ordinary close saves once, blocks repeated clicks and allows the final close',async()=>{
 let finish;const f=fixture({save:()=>new Promise(resolve=>{finish=resolve;})});
 f.fire();f.fire();await tick();assert.equal(f.isAllowed(),false);finish();await tick();
 assert.deepEqual(f.events,['prevent','prevent','allow','close']);f.fire();assert.equal(f.events.length,4);
});
test('save failure keeps the window open and permits another close attempt',async()=>{
 let fail=true;const f=fixture({save:async()=>{if(fail)throw new Error('Disk full');}});
 f.fire();await tick();assert.equal(f.isAllowed(),false);assert.ok(f.events.includes('Disk full'));
 fail=false;f.fire();await tick();assert.equal(f.isAllowed(),true);
});
test('ready update is installed by the guarded updater with no relaunch',async()=>{
 const calls=[];const f=fixture({getUpdates:()=>({canInstall:()=>true,install:async relaunch=>{calls.push(relaunch);return false;}})});
 f.fire();await tick();assert.deepEqual(calls,[false]);assert.deepEqual(f.events,['prevent']);
 f.fire();await tick();assert.deepEqual(calls,[false,false]);assert.equal(f.isAllowed(),false);
});
test('download completing during save still follows the guarded update path',async()=>{
 let ready=false;const calls=[];const f=fixture({save:async()=>{ready=true;},getUpdates:()=>({canInstall:()=>ready,install:async relaunch=>calls.push(relaunch)})});
 f.fire();await tick();assert.deepEqual(calls,[false]);assert.equal(f.isAllowed(),false);
});
test('Windows session end saves without spawning an installer during shutdown',async()=>{
 const f=fixture({isSessionEnding:()=>true,getUpdates:()=>({canInstall:()=>true,install:async()=>assert.fail('Must defer update until a normal exit')})});
 f.fire();await tick();assert.deepEqual(f.events,['prevent','save','allow','close']);
});
