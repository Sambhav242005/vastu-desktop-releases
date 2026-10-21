function configureUpdates({ autoUpdater, version, publish = () => {}, save, backup, install, log = () => {} }) {
  // Own the automatic start so progress/error state is set before the transfer,
  // and keep the library's quit hook from bypassing workspace save/backup.
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
  const canInstall = () => downloaded && (state.status==='ready'||(state.status==='error'&&state.retry==='install'));
  async function download() {
    if(downloaded||(state.status!=='available'&&!(state.status==='error'&&state.retry==='download')))return;
    update({status:'downloading',percent:0,transferred:0,total:0,bytesPerSecond:0,error:undefined},true);
    try {await autoUpdater.downloadUpdate();}catch(error){if(state.status!=='error')fail(error,'download');}
  }
  autoUpdater.on('error', error => {
    if (state.status==='error') return;
    const retry=state.status==='installing'?'install':state.status==='downloading'?'download':'check';
    // Scheduled checks stay quiet while offline; manual checks already opened the panel.
    log(`Update ${retry} failed: ${error.message}`);
    update({status:'error',retry,error:String(error.message || error)},retry!=='check');
  });
  autoUpdater.on('update-not-available', () => update({status:'upToDate',error:undefined}));
  autoUpdater.on('update-available', info => {
    if(downloaded||state.status==='downloading'||state.status==='installing')return;
    update({status:'available',availableVersion:info.version,error:undefined});
    void download();
  });
  autoUpdater.on('download-progress', info => {
    if(state.status!=='downloading')return;
    const number=n=>Number.isFinite(n)?Math.max(0,n):0;
    update({percent:Math.min(100,number(info.percent)),transferred:number(info.transferred),total:number(info.total),bytesPerSecond:number(info.bytesPerSecond)});
  });
  autoUpdater.on('update-downloaded', info => {downloaded=true;update({status:'ready',availableVersion:info.version,percent:100,error:undefined},true);});
  autoUpdater.on('update-cancelled', () => update({status:'available',percent:0}));
  return {
    getState:()=>({...state}),
    canInstall,
    async check(manual=false) {
      if(downloaded||['checking','downloading','ready','installing','available'].includes(state.status)){if(manual)update({},true);return;}
      update({status:'checking',error:undefined},manual);
      try {await autoUpdater.checkForUpdates();}catch(error){if(state.status!=='error')fail(error,'check');}
    },
    download,
    async install(relaunch=true) {
      if(!canInstall())return false;
      update({status:'installing',error:undefined},true);
      try {await save();await backup();await install(relaunch);return state.status==='installing';}catch(error){fail(error,'install');return false;}
    },
  };
}
module.exports = { configureUpdates };
