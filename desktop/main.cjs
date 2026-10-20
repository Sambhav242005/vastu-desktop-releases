const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, net, shell, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DesktopData } = require('./data.cjs');
const { registerProtocol } = require('./protocol.cjs');
const { configureUpdates } = require('./updates.cjs');
const { autoUpdater } = require('electron-updater');

app.setName('Vastu Grid');
// Keep cache outside Documents. Only durable user files belong in Documents/Vastu.
app.setPath('userData', path.join(app.getPath('appData'), 'Vastu Grid'));
protocol.registerSchemesAsPrivileged([{ scheme:'vastu', privileges:{ standard:true, secure:true, supportFetchAPI:true, corsEnabled:true, stream:true } }]);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let main, data, allowClose = false, closing = false;
  const pendingSaves = new Map();
  const log = message => { console.error(message); };
  const isTrusted = event => main && !main.isDestroyed() && event.sender === main.webContents && event.senderFrame === main.webContents.mainFrame && event.senderFrame.url.startsWith('vastu://app/') && !event.senderFrame.url.includes('/__plans/');
  function handle(channel, callback) {
    ipcMain.handle(channel, (event, ...args) => {
      if (!isTrusted(event)) throw new Error('Untrusted desktop request.');
      return callback(...args);
    });
  }
  function requestSave() {
    return new Promise((resolve, reject) => {
      if (!main || main.isDestroyed()) { reject(new Error('The workspace is not available.')); return; }
      const id = randomUUID();
      const timer = setTimeout(() => { pendingSaves.delete(id); reject(new Error('The workspace did not finish saving. Please retry.')); }, 15000);
      pendingSaves.set(id, { resolve, reject, timer });
      main.webContents.send('vastu:save-before-close', id);
    });
  }
  ipcMain.on('vastu:saved', (event, id, error) => {
    if (!isTrusted(event)) return;
    const pending = pendingSaves.get(id);
    if (!pending) return;
    clearTimeout(pending.timer); pendingSaves.delete(id);
    if (error) pending.reject(new Error(String(error))); else pending.resolve();
  });
  function safeName(value) { return String(value || 'Vastu report').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0,100); }
  async function exportFile(name, extension, bytes) {
    const { canceled, filePath } = await dialog.showSaveDialog(main, {
      defaultPath:path.join(data.root, 'exports', `${safeName(name).replace(new RegExp(`\\.${extension}$`, 'i'), '')}.${extension}`),
      filters:[{ name:extension.toUpperCase(), extensions:[extension] }],
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, bytes);
    return filePath;
  }
  async function printPdf(html, name) {
    if (typeof html !== 'string' || Buffer.byteLength(html) > 45 * 1024 * 1024) throw new Error('The PDF report is too large.');
    const preview = new BrowserWindow({ show:false, webPreferences:{ sandbox:true, contextIsolation:true, nodeIntegration:false, javascript:false } });
    try {
      await preview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdf = await preview.webContents.printToPDF({ printBackground:true, pageSize:'A4' });
      return await exportFile(name, 'pdf', pdf);
    } finally { preview.destroy(); }
  }
  app.on('second-instance', () => { if (main) { if (main.isMinimized()) main.restore(); main.show(); main.focus(); } });
  app.whenReady().then(async () => {
    try {
      // Automated tests use an explicit marked directory, never the user's projects.
      const testRoot = process.env.VASTU_DESKTOP_TEST_DOCUMENTS;
      if (testRoot && (!path.isAbsolute(testRoot) || !fs.existsSync(path.join(testRoot, '.vastu-test-root')))) throw new Error('Invalid desktop test directory.');
      data = new DesktopData(testRoot || app.getPath('documents'), app.getVersion());
      registerProtocol(protocol, net, path.join(__dirname, 'web-dist'), data);
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      session.defaultSession.setPermissionCheckHandler(() => false);
      main = new BrowserWindow({
        width:1366, height:900, minWidth:900, minHeight:650,
        title:`Vastu Grid ${app.getVersion()}`, backgroundColor:'#f5f0eb',
        icon:path.join(__dirname, 'assets', 'icon.ico'),
        webPreferences:{ preload:path.join(__dirname,'preload.cjs'), sandbox:true, contextIsolation:true, nodeIntegration:false },
      });
      main.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
      main.webContents.on('page-title-updated',event=>{event.preventDefault();main.setTitle(`Vastu Grid ${app.getVersion()}`);});
      main.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('vastu://app/') || url.includes('/__plans/')) event.preventDefault();
      });
      main.on('close', event => {
        if (allowClose) return;
        event.preventDefault();
        if (closing) return;
        closing = true;
        void requestSave().then(() => { allowClose = true; main.close(); }).catch(error => {
          closing = false;
          void dialog.showMessageBox(main, { type:'error', message:'Your workspace could not finish saving.', detail:`${error.message}\nThe window will stay open so you can retry.` });
        });
      });
      handle('vastu:storage:get', key => data.getItem(key));
      handle('vastu:storage:set', (key,value) => data.setItem(key,value));
      handle('vastu:storage:remove', key => data.removeItem(key));
      handle('vastu:plan', (base64,mime) => data.savePlan(base64,mime));
      handle('vastu:pdf', printPdf);
      handle('vastu:dxf', (name,content) => {
        if (typeof content !== 'string' || Buffer.byteLength(content) > 25 * 1024 * 1024) throw new Error('Invalid DXF content.');
        return exportFile(name,'dxf',content);
      });
      const updates = configureUpdates({ autoUpdater, version:app.getVersion(), save:requestSave,
        publish:state=>{if(main&&!main.isDestroyed())main.webContents.send('vastu:update-state',state);},
        backup:()=>data.backup('before-install'), install:()=>{ allowClose=true; autoUpdater.quitAndInstall(true,true); }, log });
      handle('vastu:version',()=>app.getVersion());
      handle('vastu:update:get',()=>updates.getState());
      handle('vastu:update:action',async action=>{
        if(action==='check')await updates.check(true);
        else if(action==='download')await updates.download();
        else if(action==='install')await updates.install();
        else throw new Error('Invalid update action.');
        return updates.getState();
      });
      Menu.setApplicationMenu(Menu.buildFromTemplate([
        { label:'File', submenu:[
          { label:'Open Vastu data folder', click:()=>{ void shell.openPath(data.root); } },
          { label:'Back up projects and plans', click:async()=>{ try { await requestSave(); const location=data.backup(); await dialog.showMessageBox(main,{message:'Backup saved.',detail:location}); } catch(error) { await dialog.showMessageBox(main,{type:'error',message:'Backup failed. Original data is preserved.',detail:error.message}); } } },
          { type:'separator' }, { label:'Exit', accelerator:'Alt+F4', click:()=>main.close() },
        ] },
        { label:'Edit', submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}] },
        { label:'View', submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}] },
        { label:'Help', submenu:[
          { label:'Check for updates', click:()=>app.isPackaged ? void updates.check(true) : void dialog.showMessageBox(main,{message:'Updates are checked in the installed Windows app.'}) },
          { label:'About Vastu Grid', click:()=>{ void dialog.showMessageBox(main,{message:`Vastu Grid ${app.getVersion()}`,detail:`Core features work offline. Maps and online services require internet.\n\nYour data: ${data.root}`}); } },
        ] },
      ]));
      // Expo's initial Redirect can replace '/' before Electron's load promise settles.
      await main.loadURL('vastu://app/').catch(error => { if (error.errno !== -3 && error.code !== 'ERR_ABORTED') throw error; });
      if (app.isPackaged && !testRoot) {
        const timer = setTimeout(()=>{ void updates.check(); }, 20000); timer.unref();
        const interval = setInterval(()=>{ void updates.check(); }, 4*60*60*1000); interval.unref();
      }
    } catch (error) { log(error.stack || error.message); dialog.showErrorBox('Vastu Grid could not start', `${error.message}\n\nExisting projects have not been reset or deleted.`); allowClose=true; app.quit(); }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { data?.close(); });
}
