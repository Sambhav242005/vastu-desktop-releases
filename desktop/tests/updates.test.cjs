const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {configureUpdates}=require('../updates.cjs');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('downloaded update saves and backs up before installing',async()=>{
  const autoUpdater=new EventEmitter(),events=[];
  autoUpdater.checkForUpdates=async()=>{};
  configureUpdates({autoUpdater,window:()=>({}),dialog:{showMessageBox:async()=>({response:0})},
    save:async()=>events.push('save'),backup:async()=>events.push('backup'),install:()=>events.push('install'),log:()=>{}});
  assert.equal(autoUpdater.autoDownload,true);
  assert.equal(autoUpdater.autoInstallOnAppQuit,false);
  autoUpdater.emit('update-downloaded');await settle();
  assert.deepEqual(events,['save','backup','install']);
});
test('save or backup failure prevents update installation',async()=>{
  for(const stage of ['save','backup']){
    const autoUpdater=new EventEmitter();let installed=false;
    configureUpdates({autoUpdater,window:()=>({}),dialog:{showMessageBox:async()=>({response:0})},
      save:async()=>{if(stage==='save')throw new Error('Disk full');},backup:async()=>{if(stage==='backup')throw new Error('Disk full');},install:()=>{installed=true;},log:()=>{}});
    autoUpdater.emit('update-downloaded');await settle();
    assert.equal(installed,false);
  }
});
test('deferring an update leaves the running app and its work untouched',async()=>{
  const autoUpdater=new EventEmitter();let actions=0;
  configureUpdates({autoUpdater,window:()=>({}),dialog:{showMessageBox:async()=>({response:1})},save:async()=>actions++,backup:async()=>actions++,install:()=>actions++,log:()=>{}});
  autoUpdater.emit('update-downloaded');await settle();assert.equal(actions,0);
});
