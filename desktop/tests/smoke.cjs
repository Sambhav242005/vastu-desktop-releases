const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { DesktopData } = require('../data.cjs');

const root = path.resolve(__dirname,'../..');
fs.mkdirSync(path.join(root,'work'),{recursive:true});
const documents = fs.mkdtempSync(path.join(root,'work','desktop-smoke-'));
fs.writeFileSync(path.join(documents,'.vastu-test-root'),'automated test data only');
const packaged = process.argv.includes('--packaged');
const executablePath = packaged ? path.join(root,'release-artifacts/desktop/win-unpacked/Vastu Grid.exe') : require('electron');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

async function launch() {
  const env={...process.env,VASTU_DESKTOP_TEST_DOCUMENTS:documents};delete env.ELECTRON_RUN_AS_NODE;
  const instance=await electron.launch({executablePath,args:packaged?[]:[path.join(root,'desktop')],env,timeout:60000});
  const actual=await instance.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged}));
  if(actual.packaged!==packaged || actual.version!==require('../package.json').version)throw new Error(`Unexpected desktop binary: ${JSON.stringify(actual)}`);
  instance.process().stderr.on('data',chunk=>process.stderr.write(chunk));
  const window=await instance.firstWindow();
  await window.setViewportSize({width:1350,height:900});
  window.on('console',message=>{if(message.type()==='error')console.error('renderer:',message.text());});
  console.log('Desktop window:', await window.url());
  try { await window.waitForFunction(()=>!!window.vastuDesktop,{},{timeout:15000}); }
  catch(error) { await window.screenshot({path:path.join(root,'work','desktop-launch-error.png')});await instance.close();throw error; }
  return {instance,window};
}
async function close(instance) {
  // Exercise the production save-before-close handshake rather than killing Electron.
  const exited=new Promise((resolve,reject)=>{ const timer=setTimeout(()=>reject(new Error('App did not flush and close')),20000);instance.on('close',()=>{clearTimeout(timer);resolve();}); });
  await instance.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  await exited;
}
(async()=>{
  let active;
  try {
    active=await launch();
    const errors=[];active.window.on('pageerror',error=>errors.push(error.message));
    // Abort every remote request: the renderer must still load and save offline.
    await active.window.route(/^https?:\/\//,route=>route.abort());
    await active.window.reload();
    await expect(active.window.getByText('Your work saves automatically on this device.').first()).toBeVisible({timeout:30000});
    const sample={schemaVersion:1,projects:[{
      schemaVersion:1,id:'desktop-test-house',name:'Offline test house',type:'vastu',createdAt:1,updatedAt:1,lastRoute:'/compass',
      data:{width:'30',height:'40',unit:'ft',rotation:'90',style:'traditional',entrance:'NW',insertX:'0',insertY:'0',siteLat:'',siteLng:'',planUri:null,planOpacity:.5,planNorth:'top',metadata:{clientName:'Father',notes:'Saved offline',kitchenZone:null,toiletZone:null,brahmaBlocked:null,northReference:'true',northSource:'manual',orientationConfirmed:true}},
    }],lastProjectId:'desktop-test-house'};
    const plan=await active.window.evaluate(async({sample,png})=>{
      const api=window.vastuDesktop;
      const uri=await api.savePlan(png,'image/png');
      sample.projects[0].data.metadata.plan={uri,width:1,height:1,transform:{scale:10,rotation:0,x:0,y:0},calibrated:false,opacity:.5};
      await api.storage.setItem('vastu_workspace_v1',JSON.stringify(sample));
      await api.storage.setItem('vastu_onboarding_seen_v1','1');
      return uri;
    },{sample,png});
    await active.window.reload();
    await expect(active.window.getByRole('button',{name:'Continue Offline test house',exact:true}).first()).toBeVisible({timeout:30000});
    await active.window.getByRole('button',{name:'Continue Offline test house',exact:true}).first().click();
    await expect(active.window.getByRole('textbox',{name:'Project name',exact:true})).toHaveValue('Offline test house');
    // Change real form input, then close immediately: autosave debounce must be flushed.
    await active.window.getByRole('textbox',{name:'Project name',exact:true}).fill('Offline house draft');
    await expect(active.window.getByText(/Direction confirmed/)).toBeVisible();
    await active.window.getByRole('button',{name:'View grid',exact:true}).first().click();
    await expect(active.window.getByRole('button',{name:'Reset orientation to North Up'}).first()).toBeVisible();
    const savedPlan=()=>active.window.evaluate(async()=>JSON.parse(await window.vastuDesktop.storage.getItem('vastu_workspace_v1')).projects[0].data.metadata.plan);
    const beforeImage=await savedPlan();
    await active.window.getByRole('button',{name:'Edit image · Move / Resize / Rotate',exact:true}).click();
    const surface=active.window.getByTestId('image-transform-surface');
    const draftSaveError=await active.instance.evaluate(({BrowserWindow,ipcMain})=>new Promise((resolve,reject)=>{
      const id='smoke-open-editor-guard',timer=setTimeout(()=>{ipcMain.removeListener('vastu:saved',listener);reject(new Error('Draft guard did not respond'));},5000);
      const listener=(event,replyId,error)=>{if(replyId!==id)return;clearTimeout(timer);ipcMain.removeListener('vastu:saved',listener);resolve(error);};
      ipcMain.on('vastu:saved',listener);BrowserWindow.getAllWindows()[0].webContents.send('vastu:save-before-close',id);
    }));
    expect(draftSaveError).toContain('Apply or cancel the open image editor');
    const dragImage=async(dx,dy)=>{
      await surface.scrollIntoViewIfNeeded();
      await surface.hover();
      const start=await surface.evaluate(element=>{
        const box=element.getBoundingClientRect();
        const controls=[...element.querySelectorAll('[aria-label$="image resize handle"], [data-testid="image-rotation-handle"]')].map(node=>node.getBoundingClientRect());
        let best=null;
        for(let y=40;y<box.height-40;y+=20)for(let x=40;x<box.width-80;x+=20){
          const gap=Math.min(...controls.map(control=>Math.hypot(box.x+x-control.x-control.width/2,box.y+y-control.y-control.height/2)));
          if(!best||gap>best.gap)best={x:box.x+x,y:box.y+y,gap};
        }
        if(!best||best.gap<40)throw new Error('No editor drag target clear of transform handles');
        return best;
      });
      await active.window.mouse.move(start.x,start.y);
      await active.window.mouse.down();
      await active.window.mouse.move(start.x+dx,start.y+dy,{steps:8});
      await active.window.mouse.up();
    };
    await dragImage(40,20);
    await active.window.getByRole('button',{name:'Resize image',exact:true}).click();await dragImage(50,0);
    await active.window.getByRole('button',{name:'Rotate image',exact:true}).click();await dragImage(50,0);
    expect(await savedPlan()).toEqual(beforeImage);
    await active.window.getByRole('button',{name:'Apply alignment',exact:true}).click();
    await expect.poll(async()=>(await savedPlan()).transform.rotation).toBeGreaterThan(0);
    const editedImage=await savedPlan();
    expect(editedImage.transform.scale).toBeGreaterThan(beforeImage.transform.scale);
    expect(editedImage.transform.x).not.toBe(beforeImage.transform.x);
    // Exercise the dedicated rotation control as well as free-surface Rotate mode.
    await active.window.getByRole('button',{name:'Edit image · Move / Resize / Rotate',exact:true}).click();
    const rotationHandle=active.window.getByTestId('image-rotation-handle');
    await rotationHandle.scrollIntoViewIfNeeded();
    await surface.hover();
    const rotationBox=await rotationHandle.boundingBox();
    const rotationSurface=await surface.boundingBox();
    expect(rotationBox.x).toBeGreaterThanOrEqual(rotationSurface.x);
    expect(rotationBox.y).toBeGreaterThanOrEqual(rotationSurface.y);
    await active.window.mouse.move(rotationBox.x+24,rotationBox.y+24);
    await active.window.mouse.down();
    await active.window.mouse.move(rotationBox.x+54,rotationBox.y+34,{steps:8});
    await active.window.mouse.up();
    await active.window.getByRole('button',{name:'Apply alignment',exact:true}).click();
    await expect.poll(async()=>(await savedPlan()).transform.rotation).not.toBe(editedImage.transform.rotation);
    const handleEditedImage=await savedPlan();
    await active.window.getByRole('button',{name:'Edit image · Move / Resize / Rotate',exact:true}).click();
    await dragImage(-30,-20);
    await active.window.getByRole('button',{name:'Cancel changes',exact:true}).click();
    expect(await savedPlan()).toEqual(handleEditedImage);
    // Verify the new Windows Save As bridge writes image bytes and coordinate CSV.
    for(const [extension,content] of [['png',png],['csv','Point,Latitude,Longitude\n1,28.613900,77.209000\n']]){
      const filePath=path.join(documents,'Vastu','exports',`site-map.${extension}`);
      await active.instance.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},filePath);
      await active.window.evaluate(async({extension,content})=>window.vastuDesktop.exportSiteFile('site-map',extension,content),{extension,content});
      expect(fs.readFileSync(filePath)).toEqual(extension==='png'?Buffer.from(content,'base64'):Buffer.from(content));
    }
    await expect.poll(()=>active.window.getByTestId('preview-compass').evaluate(element=>Math.abs(new DOMMatrix(getComputedStyle(element).transform).b))).toBeLessThan(.001);
    await active.window.getByRole('button',{name:'Reset orientation to North Up'}).first().click();
    await expect.poll(()=>active.window.getByTestId('preview-compass').evaluate(element=>{
      const matrix=new DOMMatrix(getComputedStyle(element).transform);
      return Math.abs(matrix.a-1)<.001 && Math.abs(matrix.b)<.001;
    })).toBe(true);
    await active.window.getByRole('button',{name:'Reset view to default',exact:true}).click();
    await expect(active.window.getByText('Zoom 1.00×',{exact:true})).toBeVisible();
    await active.window.getByRole('button',{name:'Set entrance on plot',exact:true}).click();
    await active.window.getByTestId('vastu-preview-canvas').scrollIntoViewIfNeeded();
    const plotCanvas=await active.window.getByTestId('vastu-preview-canvas').boundingBox();
    await active.window.mouse.click(plotCanvas.x+plotCanvas.width*.7,plotCanvas.y+plotCanvas.height/2);
    await expect(active.window.getByRole('button',{name:'Set entrance on plot',exact:true})).toBeVisible();
    await expect.poll(()=>active.window.evaluate(async()=>JSON.parse(await window.vastuDesktop.storage.getItem('vastu_workspace_v1')).projects[0].data.metadata.entrancePlacement)).toEqual({u:.5,v:0,facing:0});
    await active.window.screenshot({path:path.join(root,'work','desktop-offline-preview.png')});
    const pdfPath=path.join(documents,'Vastu','exports','offline-report.pdf');
    await active.instance.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},pdfPath);
    await active.window.getByRole('button',{name:'Export PDF report for free',exact:true}).click();
    await expect.poll(()=>fs.existsSync(pdfPath),{timeout:20000}).toBe(true);
    if(fs.readFileSync(pdfPath).subarray(0,4).toString()!=='%PDF')throw new Error('PDF export is invalid');
    const dxfPath=path.join(documents,'Vastu','exports','offline-grid.dxf');
    await active.instance.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},dxfPath);
    active.window.once('dialog',dialog=>dialog.accept());
    await active.window.getByRole('button',{name:'Export DXF file for free',exact:true}).click();
    await expect.poll(()=>fs.existsSync(dxfPath)).toBe(true);
    if(!fs.readFileSync(dxfPath,'utf8').includes('ENTITIES'))throw new Error('DXF export is invalid');
    await active.window.getByRole('button',{name:'Close export receipt',exact:true}).click();
    assertNoErrors(errors);
    await active.window.getByRole('button',{name:'Plot setup',exact:true}).click();
    await active.window.getByRole('textbox',{name:'Project name',exact:true}).fill('Offline house saved on exit');
    await close(active.instance);active=null;
    // Simulate a prior install. New app startup must back it up and retain its data.
    const previous=new DesktopData(documents,'1.1.1');previous.close();
    active=await launch();
    await active.window.route(/^https?:\/\//,route=>route.abort());
    await active.window.reload();
    await expect(active.window.getByText('Offline house saved on exit',{exact:true}).first()).toBeVisible({timeout:30000});
    const persisted=await active.window.evaluate(async()=>JSON.parse(await window.vastuDesktop.storage.getItem('vastu_workspace_v1')));
    const data=persisted.projects[0].data;
    if(data.rotation!=='90'||data.entrance!=='E'||data.metadata.entrancePlacement?.u!==.5||data.metadata.entrancePlacement?.v!==0||data.metadata.plan.uri!==plan) throw new Error('Project fields changed across restart/update');
    const response=await active.window.evaluate(async uri=>{
      const response=await fetch(`vastu://app/__plans/${uri.slice('vastu-plan:'.length)}`);
      return {ok:response.ok,bytes:(await response.arrayBuffer()).byteLength};
    },plan);
    if(!response.ok||response.bytes===0)throw new Error('Imported plan lost after restart');
    await close(active.instance);active=null;
    console.log(`Desktop smoke passed (${packaged?'packaged':'development'}): offline UI, SQLite, imported plan, rotation, save on exit, restart and app-version backup.`);
  } catch(error) {
    if(active)console.error('Open dialog diagnostics:',await active.window.locator('[role="dialog"], [aria-modal="true"]').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent?.slice(0,160),rects:node.getClientRects().length,visibility:getComputedStyle(node).visibility,display:getComputedStyle(node).display}))));
    throw error;
  } finally { if(active)await active.instance.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
function assertNoErrors(errors){if(errors.length)throw new Error(errors.join('\n'));}
