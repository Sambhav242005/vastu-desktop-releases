function configureUpdates({ autoUpdater, version, publish = () => {}, save, backup, install, log = () => {} }) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  let downloaded = false;
  let state = { status:'idle', version, revision:0, notice:0, percent:0 };
  function update(patch, notify = false) {
    state = {...state, ...patch, revision:state.revision+1, notice:state.notice+(notify?1:0)};
    publish({...state});
  }
  function fail(error, retry) {
    log(`Update ${retry} failed: ${error.message}`);
    update({status:'error', retry, error:String(error.message || error)}, true);
  }
  autoUpdater.on('error', error => {
    if (state.status==='error') return;
    const retry=state.status==='downloading'?'download':'check';
    // Scheduled checks stay quiet while offline; manual checks already opened the panel.
    log(`Update ${retry} failed: ${error.message}`);
    update({status:'error',retry,error:String(error.message || error)},retry==='download');
  });
  autoUpdater.on('update-not-available', () => update({status:'upToDate',error:undefined}));
  autoUpdater.on('update-available', info => update({status:'available',availableVersion:info.version,error:undefined},state.availableVersion!==info.version));
  autoUpdater.on('download-progress', info => {
    if(state.status!=='downloading')return;
    const number=n=>Number.isFinite(n)?Math.max(0,n):0;
    update({percent:Math.min(100,number(info.percent)),transferred:number(info.transferred),total:number(info.total),bytesPerSecond:number(info.bytesPerSecond)});
  });
  autoUpdater.on('update-downloaded', info => {downloaded=true;update({status:'ready',availableVersion:info.version,percent:100,error:undefined},true);});
  autoUpdater.on('update-cancelled', () => update({status:'available',percent:0}));
  return {
    getState:()=>({...state}),
    async check(manual=false) {
      if(['checking','downloading','ready','installing','available'].includes(state.status)){if(manual)update({},true);return;}
      update({status:'checking',error:undefined},manual);
      try {await autoUpdater.checkForUpdates();}catch(error){if(state.status!=='error')fail(error,'check');}
    },
    async download() {
      if(state.status!=='available'&&!(state.status==='error'&&state.retry==='download'))return;
      update({status:'downloading',percent:0,error:undefined},true);
      try {await autoUpdater.downloadUpdate();}catch(error){if(state.status!=='error')fail(error,'download');}
    },
    async install() {
      if(!downloaded||state.status==='installing')return;
      update({status:'installing',error:undefined},true);
      try {await save();await backup();install();}catch(error){fail(error,'install');}
    },
  };
}
module.exports = { configureUpdates };
