// Optional live check: public Delhi fixture only; no hosted app backend or DEM import.
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
fs.mkdirSync(path.join(root,'work'),{recursive:true});
const documents=fs.mkdtempSync(path.join(root,'work','online-terrain-'));
fs.writeFileSync(path.join(documents,'.vastu-test-root'),'isolated terrain check');
(async()=>{
 let app;
 try{
  const env={...process.env,VASTU_DESKTOP_TEST_DOCUMENTS:documents};delete env.ELECTRON_RUN_AS_NODE;delete env.EXPO_PUBLIC_TERRAIN_API_URL;
  app=await electron.launch({executablePath:path.join(root,'release-artifacts/desktop/win-unpacked/Vastu Grid.exe'),args:[],env,timeout:60000});
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.vastuDesktop?.getTerrain);
  const result=await page.evaluate(async()=>{
   const points=[{lat:28.614,lng:77.209},{lat:28.614,lng:77.213},{lat:28.610,lng:77.213},{lat:28.610,lng:77.209}];
   const invalid=await window.vastuDesktop.getTerrain('invalid',points,'nearest').then(()=>false,()=>true);
   const cancelId=crypto.randomUUID(),pending=window.vastuDesktop.getTerrain(cancelId,points,'nearest').then(()=>false,()=>true);
   await window.vastuDesktop.cancelTerrain(cancelId);
   const cancelled=await pending;
   const grid=await window.vastuDesktop.getTerrain(crypto.randomUUID(),points,'nearest');
   const valid=grid.elevations.filter(Number.isFinite);
   return {invalid,cancelled,rows:grid.rows,columns:grid.columns,count:grid.elevations.length,valid:valid.length,min:Math.min(...valid),max:Math.max(...valid),source:grid.source};
  });
  expect(result.source.id).toBe('copernicus-glo30');expect(result.source.spacingM).toBeGreaterThan(20);
  expect(result.invalid).toBe(true);expect(result.cancelled).toBe(true);
  expect(result.count).toBe(result.rows*result.columns);expect(result.valid).toBeGreaterThan(4);
  expect(result.min).toBeGreaterThan(100);expect(result.max).toBeLessThan(400);
  console.log('Packaged Windows direct online Copernicus passed (no API URL):',JSON.stringify(result));
 }finally{if(app)await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
