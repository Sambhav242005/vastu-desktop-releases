// Real packaged electron-updater HTTP transfer, with only installer execution intercepted.
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createHash}=require('node:crypto');
const {startAutomaticUpdates}=require('../automatic-updates.cjs');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'release-artifacts/desktop');
const version=require('../package.json').version;
fs.mkdirSync(path.join(root,'work'),{recursive:true});
const documents=fs.mkdtempSync(path.join(root,'work','automatic-update-'));
fs.writeFileSync(path.join(documents,'.vastu-test-root'),'test data only');
(async()=>{
 let app,server,stopAutomatic,servedInstaller=false;
 try{
  const installer=`Vastu-Grid-Setup-${version}-x64.exe`;
  server=http.createServer((request,response)=>{
   const name=path.basename(decodeURIComponent(request.url.split('?')[0]));
   if(!['latest.yml',installer,installer+'.blockmap'].includes(name)){response.writeHead(404);response.end();return;}
   if(name===installer)servedInstaller=true;
   response.setHeader('Content-Length',fs.statSync(path.join(output,name)).size);
   fs.createReadStream(path.join(output,name)).pipe(response);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const env={...process.env,VASTU_DESKTOP_TEST_DOCUMENTS:documents};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:path.join(output,'win-unpacked/Vastu Grid.exe'),args:[],env,timeout:60000});
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.vastuDesktop);
  await expect(page.getByText('Your work saves automatically on this device.').first()).toBeVisible();
  const sample={schemaVersion:1,lastProjectId:'auto-update',projects:[{schemaVersion:1,id:'auto-update',name:'Automatic update test',type:'vastu',createdAt:1,updatedAt:1,lastRoute:'/compass',data:{width:'30',height:'40',unit:'ft',rotation:'25',style:'traditional',entrance:'N',insertX:'0',insertY:'0',siteLat:'',siteLng:'',planUri:null,planOpacity:.5,planNorth:'top',metadata:{orientationConfirmed:true}}}]};
  await page.evaluate(async sample=>{await window.vastuDesktop.storage.setItem('vastu_workspace_v1',JSON.stringify(sample));await window.vastuDesktop.storage.setItem('vastu_onboarding_seen_v1','1');},sample);
  await page.reload();await page.getByRole('button',{name:'Continue Automatic update test',exact:true}).first().click();
  await app.evaluate(({app},feed)=>{
   const load=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/main.cjs');
   const {autoUpdater}=load('electron-updater');
   // Permit the current binary to be the transfer fixture; never publish a fake version.
   autoUpdater.currentVersion=new (load('semver').SemVer)('0.0.1');
   autoUpdater.disableDifferentialDownload=true;
   autoUpdater.downloadedUpdateHelper=new (load('electron-updater/out/DownloadedUpdateHelper').DownloadedUpdateHelper)(process.getBuiltinModule('path').join(process.env.VASTU_DESKTOP_TEST_DOCUMENTS,'.updater-cache'));
   autoUpdater.setFeedURL({provider:'generic',url:feed});
   global.automaticUpdateTest={downloads:0,installs:0};
   const download=autoUpdater.downloadUpdate.bind(autoUpdater);
   autoUpdater.downloadUpdate=(...args)=>{global.automaticUpdateTest.downloads++;return download(...args);};
   autoUpdater.on('update-downloaded',info=>{global.automaticUpdateTest.file=info.downloadedFile;});
   autoUpdater.quitAndInstall=(silent,relaunch)=>{Object.assign(global.automaticUpdateTest,{installs:global.automaticUpdateTest.installs+1,silent,relaunch});};
  },`http://127.0.0.1:${server.address().port}`);
  // Exercise the actual scheduler without buttons or injected updater events.
  let state=await page.evaluate(()=>window.vastuDesktop.updates.getState());
  const action=async type=>{state=await page.evaluate(type=>window.vastuDesktop.updates.action(type),type);};
  stopAutomatic=startAutomaticUpdates({updates:{getState:()=>state,canInstall:()=>state.status==='ready'||state.retry==='install',check:()=>action('check'),download:()=>action('download'),install:()=>action('install')},canRestart:()=>page.evaluate(()=>![...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].some(node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden')),setTimer:(callback,delay)=>setTimeout(async()=>{state=await page.evaluate(()=>window.vastuDesktop.updates.getState());callback();},delay)});
  await expect.poll(async()=>{
   const state=await page.evaluate(()=>window.vastuDesktop.updates.getState());
   if(state.status==='error')throw new Error(state.error);return state.status;
  },{timeout:120000,intervals:[100,500,1000]}).toBe('ready');
  const transfer=await app.evaluate(()=>global.automaticUpdateTest);
  expect(servedInstaller).toBe(true);
  expect(transfer.downloads).toBe(1);expect(transfer.installs).toBe(0);
  expect(createHash('sha512').update(fs.readFileSync(transfer.file)).digest('hex')).toBe(createHash('sha512').update(fs.readFileSync(path.join(output,installer))).digest('hex'));
  await page.getByRole('textbox',{name:'Project name',exact:true}).fill('Saved before automatic update');
  await expect.poll(()=>app.evaluate(()=>global.automaticUpdateTest.installs),{timeout:40000}).toBe(1);
  expect(await app.evaluate(()=>({silent:global.automaticUpdateTest.silent,relaunch:global.automaticUpdateTest.relaunch}))).toEqual({silent:true,relaunch:true});
  const data=JSON.parse(await page.evaluate(()=>window.vastuDesktop.storage.getItem('vastu_workspace_v1')));
  expect(data.projects[0].name).toBe('Saved before automatic update');
  expect(fs.readdirSync(path.join(documents,'Vastu/backups')).some(name=>name.includes('before-install'))).toBe(true);
  console.log(`PASS packaged ${version}: scheduled provider check, automatic verified download, save/backup and automatic silent restart without clicking Check, Download, Restart or Close.`);
 }finally{stopAutomatic?.();if(app)await app.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
