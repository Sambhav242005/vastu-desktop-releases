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
test('notify before downloading; repeated checks and Later do not start downloads',async()=>{
 const {autoUpdater,updates,events}=fixture();assert.equal(autoUpdater.autoDownload,false);assert.equal(autoUpdater.autoInstallOnAppQuit,false);
 await updates.check();assert.equal(updates.getState().status,'available');assert.equal(updates.getState().availableVersion,'1.1.12');
 await updates.check(true);assert.deepEqual(events,['check']);assert.equal(updates.getState().notice,2);
 await updates.install();assert.deepEqual(events,['check']);
});
test('one download at a time, real progress fields, and ready waits for an explicit restart',async()=>{
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
