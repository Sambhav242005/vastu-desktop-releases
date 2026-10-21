const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {configureUpdates}=require('../updates.cjs');
function fixture(overrides={}){
 const autoUpdater=new EventEmitter(),events=[],states=[];
 autoUpdater.checkForUpdates=async()=>{events.push('check');autoUpdater.emit('update-available',{version:'1.1.12'});};
 autoUpdater.downloadUpdate=async()=>{events.push('download');};
 const updates=configureUpdates({autoUpdater,version:'1.1.11',publish:s=>states.push(s),save:async()=>events.push('save'),backup:async()=>events.push('backup'),install:()=>events.push('install'),...overrides});
 return {autoUpdater,updates,events,states};
}
test('available updates download automatically once and never interrupt work to install',async()=>{
 const {autoUpdater,updates,events}=fixture();assert.equal(autoUpdater.autoDownload,false);assert.equal(autoUpdater.autoInstallOnAppQuit,false);
 await updates.check();assert.equal(updates.getState().status,'downloading');assert.equal(updates.getState().availableVersion,'1.1.12');
 autoUpdater.emit('update-available',{version:'1.1.12'});
 await updates.check(true);assert.deepEqual(events,['check','download']);
 await updates.install();assert.deepEqual(events,['check','download']);
});
test('one download at a time, real progress fields, and ready waits for safe exit or restart',async()=>{
 const {autoUpdater,updates,events}=fixture();await updates.check();await updates.download();await updates.download();
 assert.deepEqual(events,['check','download']);
 autoUpdater.emit('download-progress',{percent:42.5,transferred:425,total:1000,bytesPerSecond:100});
 assert.equal(updates.getState().percent,42.5);assert.equal(updates.getState().transferred,425);
 autoUpdater.emit('update-downloaded',{version:'1.1.12'});assert.equal(updates.getState().status,'ready');
 assert.deepEqual(events,['check','download']);
 await updates.install();await updates.install();assert.deepEqual(events,['check','download','save','backup','install']);
});
test('save or backup failure prevents install and allows a safe retry',async()=>{
 for(const stage of ['save','backup']){
  let installed=0,fail=true;
  const {autoUpdater,updates}=fixture({save:async()=>{if(stage==='save'&&fail)throw new Error('Disk full');},backup:async()=>{if(stage==='backup'&&fail)throw new Error('Disk full');},install:()=>installed++});
  autoUpdater.emit('update-downloaded',{version:'1.1.12'});await updates.install();
  assert.equal(installed,0);assert.equal(updates.getState().retry,'install');
  fail=false;await updates.install();assert.equal(installed,1);
 }
});
test('download failure retains an actionable error, retry and monotonic progress snapshots',async()=>{
 const {autoUpdater,updates,states}=fixture();await updates.check();await updates.download();
 autoUpdater.emit('error',new Error('Connection interrupted'));assert.equal(updates.getState().retry,'download');
 await updates.download();assert.equal(updates.getState().status,'downloading');
 for(let i=1;i<states.length;i++)assert.ok(states[i].revision>states[i-1].revision);
});
test('background offline check stays quiet; clicking check during a check opens its status',async()=>{
 const {autoUpdater,updates}=fixture();autoUpdater.checkForUpdates=async()=>{};
 await updates.check();assert.equal(updates.getState().notice,0);
 await updates.check(true);assert.equal(updates.getState().notice,1);
 autoUpdater.emit('error',new Error('Service unavailable'));assert.equal(updates.getState().status,'error');
});

test('safe close installs without relaunch, after saving and backing up, and is single flight',async()=>{
 const events=[],{autoUpdater,updates}=fixture({save:async()=>events.push('save'),backup:async()=>events.push('backup'),install:relaunch=>events.push(['install',relaunch])});
 assert.equal(updates.canInstall(),false);
 autoUpdater.emit('update-downloaded',{version:'1.1.12'});assert.equal(updates.canInstall(),true);
 const result=await Promise.all([updates.install(false),updates.install(false)]);
 assert.deepEqual(events,['save','backup',['install',false]]);assert.deepEqual(result,[true,false]);
});

test('installer errors preserve the downloaded update for retry and background checks cannot discard it',async()=>{
 let fail=true;const events=[];
 const {autoUpdater,updates}=fixture({install:()=>{events.push('install');if(fail)autoUpdater.emit('error',new Error('Installer could not start'));}});
 autoUpdater.emit('update-downloaded',{version:'1.1.12'});
 assert.equal(await updates.install(),false);assert.equal(updates.getState().retry,'install');assert.equal(updates.canInstall(),true);
 await updates.check();assert.equal(updates.getState().retry,'install');
 fail=false;assert.equal(await updates.install(),true);assert.deepEqual(events,['install','install']);
});
