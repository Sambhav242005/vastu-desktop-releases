const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vastuDesktop', {
  getVersion:()=>ipcRenderer.invoke('vastu:version'),
  updates:{
    getState:()=>ipcRenderer.invoke('vastu:update:get'),
    action:action=>ipcRenderer.invoke('vastu:update:action',action),
    onState:callback=>{
      const listener=(_event,state)=>callback(state);
      ipcRenderer.on('vastu:update-state',listener);
      return ()=>ipcRenderer.removeListener('vastu:update-state',listener);
    },
  },
  storage: {
    getItem: key => ipcRenderer.invoke('vastu:storage:get', key),
    setItem: (key, value) => ipcRenderer.invoke('vastu:storage:set', key, value),
    removeItem: key => ipcRenderer.invoke('vastu:storage:remove', key),
  },
  savePlan: (base64, mime) => ipcRenderer.invoke('vastu:plan', base64, mime),
  exportPdf: (html, name) => ipcRenderer.invoke('vastu:pdf', html, name),
  exportDxf: (name, content) => ipcRenderer.invoke('vastu:dxf', name, content),
  onSaveBeforeClose: callback => {
    const listener = async (_event, id) => {
      try { await callback(); ipcRenderer.send('vastu:saved', id, null); }
      catch (error) { ipcRenderer.send('vastu:saved', id, String(error?.message || error)); }
    };
    ipcRenderer.on('vastu:save-before-close', listener);
    return () => ipcRenderer.removeListener('vastu:save-before-close', listener);
  },
});
