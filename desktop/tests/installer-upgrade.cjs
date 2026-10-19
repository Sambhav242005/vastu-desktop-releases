// Optional real NSIS + electron-updater test. Requires both installer versions.
const { _electron:electron, expect }=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../..');
const output=path.join(root,'release-artifacts/desktop');
const fixture=fs.mkdtempSync(path.join(root,'work','installer-upgrade-'));
const installed=path.join(fixture,'app');
const documents=path.join(fixture,'documents');
fs.mkdirSync(documents);fs.writeFileSync(path.join(documents,'.vastu-test-root'),'test');
const executablePath=path.join(installed,'Vastu Grid.exe');
function run(exe,args){return new Promise((resolve,reject)=>{const child=spawn(exe,args,{stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Installer exit ${code}`)));});}
async function launch(){
  const env={...process.env,VASTU_DESKTOP_TEST_DOCUMENTS:documents};delete env.ELECTRON_RUN_AS_NODE;
  const instance=await electron.launch({executablePath,args:[],env,timeout:60000});
  const page=await instance.firstWindow();await page.waitForFunction(()=>!!window.vastuDesktop);
  return {instance,page};
}
(async()=>{
  let active,server;
  try {
    console.log('Installing version 1.1.2 in isolated test folder...');
    await run(path.join(output,'Vastu-Grid-Setup-1.1.2-x64.exe'),['/S',`/D=${installed}`]);
    active=await launch();
    await expect(active.page.getByText('Your work saves automatically on this device.').first()).toBeVisible();
    const payload=await active.page.evaluate(async()=>{
      const plan=await window.vastuDesktop.savePlan('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','image/png');
      const value=JSON.stringify({schemaVersion:1,lastProjectId:'upgrade-house',projects:[{schemaVersion:1,id:'upgrade-house',name:'House preserved through installer',type:'vastu',createdAt:1,updatedAt:1,lastRoute:'/compass',data:{width:'30',height:'40',unit:'ft',rotation:'25',style:'traditional',entrance:'N',insertX:'0',insertY:'0',siteLat:'',siteLng:'',planUri:null,planOpacity:.5,planNorth:'top',metadata:{clientName:'',notes:'Offline installer test',kitchenZone:null,toiletZone:null,brahmaBlocked:null,northReference:'true',northSource:'manual',orientationConfirmed:true,plan:{uri:plan,width:1,height:1,calibrated:false,opacity:.5,transform:{scale:1,rotation:0,x:0,y:0}}}}}]});
      await window.vastuDesktop.storage.setItem('vastu_workspace_v1',value);
      await window.vastuDesktop.storage.setItem('vastu_onboarding_seen_v1','1');
      return value;
    });
    await active.page.reload();
    await active.page.getByRole('button',{name:'Continue House preserved through installer',exact:true}).first().click();
    await expect(active.page.getByRole('textbox',{name:'Project name',exact:true})).toHaveValue('House preserved through installer');
    // Serve the real release assets locally. No release is published for this test.
    server=http.createServer((request,response)=>{
      const name=path.basename(decodeURIComponent(request.url.split('?')[0]));
      if(!['latest.yml','Vastu-Grid-Setup-1.1.3-x64.exe','Vastu-Grid-Setup-1.1.3-x64.exe.blockmap'].includes(name)){response.writeHead(404);response.end();return;}
      response.setHeader('Content-Length',fs.statSync(path.join(output,name)).size);
      fs.createReadStream(path.join(output,name)).pipe(response);
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const feed=`http://127.0.0.1:${server.address().port}`;
    console.log('Downloading and installing version 1.1.3 with electron-updater...');
    const exited=new Promise(resolve=>active.instance.on('close',resolve));
    await active.instance.evaluate(async({app,dialog},url)=>{
      const load=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/main.cjs');
      const {autoUpdater}=load('electron-updater');
      // Test accepts the real restart prompt, suppressing the NSIS UI and auto-launch only.
      dialog.showMessageBox=async()=>({response:0});
      const original=autoUpdater.quitAndInstall.bind(autoUpdater);
      autoUpdater.quitAndInstall=()=>original(true,false);
      autoUpdater.disableDifferentialDownload=true;
      autoUpdater.setFeedURL({provider:'generic',url});
      await autoUpdater.checkForUpdates();
    },feed);
    await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Updater did not exit old app')),60000).unref())]);active=null;
    // NSIS runs separately after the old app exits. Wait for the new packaged version.
    await expect.poll(()=>{
      try { const {extractFile}=require('@electron/asar');return JSON.parse(extractFile(path.join(installed,'resources/app.asar'),'package.json')).version; }
      catch{return null;}
    },{timeout:90000,intervals:[1000]}).toBe('1.1.3');
    active=await launch();
    await expect(active.page.getByRole('textbox',{name:'Project name',exact:true})).toHaveValue('House preserved through installer',{timeout:30000});
    const saved=await active.page.evaluate(()=>window.vastuDesktop.storage.getItem('vastu_workspace_v1'));
    const before=JSON.parse(payload).projects[0],after=JSON.parse(saved).projects[0];
    if(JSON.stringify(before.data)!==JSON.stringify(after.data))throw new Error('Project content changed during installed update');
    const plan=path.join(documents,'Vastu/plans',after.data.metadata.plan.uri.slice('vastu-plan:'.length));
    if(!fs.existsSync(plan))throw new Error('Imported plan was lost');
    await active.instance.close();active=null;
    const db=new DatabaseSync(path.join(documents,'Vastu/projects.db'));
    if(db.prepare("SELECT value FROM metadata WHERE key='appVersion'").get().value!=='1.1.3')throw new Error('New version did not open existing database');db.close();
    console.log('PASS: real installer 1.1.2 -> downloaded update 1.1.3 preserves projects, plans and backups.');
  } finally {
    if(active)await active.instance.close();
    if(server)await new Promise(resolve=>server.close(resolve));
    const uninstaller=path.join(installed,'Uninstall Vastu Grid.exe');
    if(fs.existsSync(uninstaller))await run(uninstaller,['/S',`_?=${installed}`]);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
