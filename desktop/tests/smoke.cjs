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
  await instance.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.webContents.setBackgroundThrottling(false);window.setSize(1350,900);window.hide();});
  for (const width of [1000,1350]) {
    const expected = await instance.evaluate(({BrowserWindow},width)=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(width,900);return win.getContentBounds().width;},width);
    await expect.poll(()=>window.evaluate(()=>innerWidth)).toBe(expected);
  }

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
    await active.window.getByRole('button',{name:'Open project Offline test house',exact:true}).click();
    await expect(active.window.getByText('Birth details',{exact:true})).toBeVisible({timeout:30000});
    await active.window.getByRole('textbox',{name:'Name',exact:true}).fill('Anita');
    await active.window.getByRole('combobox',{name:'Gender'}).selectOption('female');
    await active.window.locator('input[type=date]').fill('2000-01-01');
    await active.window.locator('input[type=time]').fill('12:00');
    await active.window.getByRole('textbox',{name:'Place of birth',exact:true}).fill('Delhi');
    await active.window.getByRole('button',{name:/Delhi/}).first().click();
    await active.window.getByRole('button',{name:'Next: Vastu',exact:true}).click();
    await expect(active.window.getByText('Plot measurements',{exact:true})).toBeVisible();
    await active.window.getByRole('button',{name:'Review grid →',exact:true}).click();
    await expect(active.window.getByRole('heading',{name:'Review & export',exact:true})).toBeVisible();
    await expect(active.window.getByRole('button',{name:'Open 9 × 9 grid and exports',exact:true})).toHaveCount(0);
    // Cancel and retry through the same UI used for real Save As.
    await active.instance.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});
    await active.window.getByRole('button',{name:'Export PDF',exact:true}).click();
    await expect(active.window.getByRole('button',{name:'Export PDF',exact:true})).toBeEnabled({timeout:20000});
    const pdfPath=path.join(documents,'Vastu','exports','offline-report.pdf');
    await active.instance.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},pdfPath);
    await active.window.getByRole('button',{name:'Export PDF',exact:true}).click();
    await expect(active.window.getByText('PDF ready.',{exact:true})).toBeVisible({timeout:20000});
    if(fs.readFileSync(pdfPath).subarray(0,4).toString()!=='%PDF')throw new Error('PDF export is invalid');
    const dxfPath=path.join(documents,'Vastu','exports','offline-grid.dxf');
    await active.instance.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});
    await active.window.getByRole('button',{name:'Export DXF',exact:true}).click();
    await expect(active.window.getByRole('button',{name:'Export DXF',exact:true})).toBeEnabled();
    const invalidPath=path.join(documents,'missing-parent','grid.dxf');
    await active.instance.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},invalidPath);
    await active.window.getByRole('button',{name:'Export DXF',exact:true}).click();
    await expect(active.window.getByRole('alert')).toBeVisible();
    await active.instance.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},dxfPath);
    for(let i=0;i<3;i++){
      await active.window.getByRole('button',{name:'Export DXF',exact:true}).click();
      await expect(active.window.getByText('DXF ready.',{exact:true})).toBeVisible();
    }
    const dxf=fs.readFileSync(dxfPath,'utf8');
    if((dxf.match(/0\nLWPOLYLINE\n/g)||[]).length!==46)throw new Error('DXF must contain 45 sections and one boundary');
    if(!dxf.includes('$INSUNITS\n70\n2'))throw new Error('DXF must use feet');
    assertNoErrors(errors);
    await active.window.getByRole('button',{name:'Back',exact:true}).click();
    await expect(active.window.getByText('Plot measurements',{exact:true}).filter({visible:true})).toBeVisible();
    await active.window.getByRole('textbox',{name:'Plot angle from North',exact:true}).fill('45');
    await close(active.instance);active=null;
    const previous=new DesktopData(documents,'1.1.1');previous.close();
    active=await launch();
    await active.window.route(/^https?:\/\//,route=>route.abort());
    await active.window.reload();
    await expect(active.window.getByText('Birth details',{exact:true})).toBeVisible({timeout:30000});
    await expect(active.window.getByRole('navigation').getByText('Plot',{exact:true})).toHaveCount(0);
    const persisted=await active.window.evaluate(async()=>JSON.parse(await window.vastuDesktop.storage.getItem('vastu_workspace_v1')));
    const project=persisted.projects[0],data=project.data;
    if(project.name!=='Offline test house'||project.kundli.lastCalculatedBirth.name!=='Anita'||data.rotation!=='45'||data.metadata.plan.uri!==plan)throw new Error('Project fields changed across restart/update');
    console.log('Export fixtures:',pdfPath,dxfPath);
    const response=await active.window.evaluate(async uri=>{
      const response=await fetch(`vastu://app/__plans/${uri.slice('vastu-plan:'.length)}`);
      return {ok:response.ok,bytes:(await response.arrayBuffer()).byteLength};
    },plan);
    if(!response.ok||response.bytes===0)throw new Error('Imported plan lost after restart');
    await close(active.instance);active=null;
    console.log(`Desktop smoke passed (${packaged?'packaged':'development'}): offline UI, SQLite, PDF/DXF cancellation and retry, saved plan preservation, rotation, restart and app-version backup.`);
  } finally { if(active)await active.instance.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
function assertNoErrors(errors){if(errors.length)throw new Error(errors.join('\n'));}
