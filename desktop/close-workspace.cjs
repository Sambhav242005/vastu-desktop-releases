/** One exit path for the window button, File/Exit and app.quit(). */
function createWorkspaceClose({ isAllowed, allowClose, isSessionEnding, getUpdates, save, close, onError }) {
  let closing=false;
  return event => {
    if(isAllowed())return;
    event.preventDefault();
    if(closing)return;
    closing=true;
    void (async()=>{
      const installReady=async()=>{
        const updates=getUpdates();
        if(isSessionEnding()||!updates?.canInstall())return false;
        // The updater owns save + backup. A failed install leaves this window open.
        await updates.install(false);
        return true;
      };
      if(await installReady())return;
      await save();
      // The download may have finished while the renderer flushed its edits.
      if(await installReady())return;
      allowClose();close();
    })().catch(onError).finally(()=>{closing=false;});
  };
}
module.exports={createWorkspaceClose};
