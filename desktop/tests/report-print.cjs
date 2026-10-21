const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const ts=require('../../node_modules/typescript');
const {chromium}=require('@playwright/test');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {buildReportHtml}=require('../../src/lib/report.ts');
const {computeVastuLayout}=require('../../src/lib/layout.ts');
const grid=require('../../src/data/vastu-grid-traditional.json');
const output=path.resolve(__dirname,'../../work/report-print');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:process.env.VASTU_PRINT_BROWSER||'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:720,height:1000}});
  const input={name:'Print layout check',width:30,height:40,rotationDeg:25,unit:'ft',style:'traditional',entrance:'NW',gridVerified:false,northSource:'map',northReference:'true',siteLat:'23.325448',siteLng:'75.041867',layout:computeVastuLayout({widthUnits:30,heightUnits:40,rotationDeg:25,style:'traditional'},grid)};
  const html=buildReportHtml(input);fs.writeFileSync(path.join(output,'report.html'),html);
  await page.setContent(html);await page.emulateMedia({media:'print'});
  await page.pdf({path:path.join(output,'report.pdf'),format:'A4',printBackground:true,margin:{top:'1cm',bottom:'1cm',left:'1cm',right:'1cm'}});
  const lines=await page.locator('.sev').evaluateAll(labels=>labels.map(el=>{const r=document.createRange();r.selectNodeContents(el);return r.getClientRects().length;}));
  assert.ok(lines.every(n=>n===1),'Severity labels must stay on a single line');
  await page.setContent(buildReportHtml({...input,entrance:'SW',kitchenZone:'ne',toiletZone:'center',brahmaBlocked:true}));
  await page.pdf({path:path.join(output,'long-report.pdf'),format:'A4',printBackground:true,margin:{top:'1cm',bottom:'1cm',left:'1cm',right:'1cm'}});
  console.log('Report print passed: severity labels remain whole; A4 PDF saved to work/report-print/report.pdf.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
