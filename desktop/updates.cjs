function configureUpdates({ autoUpdater, dialog, window, save, backup, install, log }) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  let checking = false;
  let manual = false;
  let downloaded = false;
  autoUpdater.on('error', error => {
    checking = false;
    log(`Update check failed: ${error.message}`);
    if (manual) void dialog.showMessageBox(window(), { type:'info', message:'Could not check for updates.', detail:'Your installed app works offline. Try again when connected to the internet.' });
    manual = false;
  });
  autoUpdater.on('update-not-available', () => {
    checking = false;
    if (manual) void dialog.showMessageBox(window(), { message:'Vastu Grid is up to date.' });
    manual = false;
  });
  autoUpdater.on('update-available', () => { checking = false; manual = false; });
  const offerInstall = async () => {
    const { response } = await dialog.showMessageBox(window(), {
      type:'info', message:'A Vastu Grid update is ready.',
      detail:'Your projects will be saved and backed up before the app restarts.',
      buttons:['Restart to update','Later'], defaultId:1, cancelId:1,
    });
    if (response !== 0) return;
    try { await save(); await backup(); install(); }
    catch (error) { await dialog.showMessageBox(window(), { type:'error', message:'Update postponed to protect your work.', detail:error.message }); }
  };
  autoUpdater.on('update-downloaded', () => { downloaded = true; void offerInstall(); });
  return async (userRequested = false) => {
    if (downloaded) { if (userRequested) await offerInstall(); return; }
    if (checking) return;
    checking = true; manual = userRequested;
    try { await autoUpdater.checkForUpdates(); }
    catch { checking = false; /* error event supplies the user message */ }
  };
}
module.exports = { configureUpdates };
