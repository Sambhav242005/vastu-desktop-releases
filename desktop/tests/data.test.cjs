const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DesktopData } = require('../data.cjs');
const { resolveRequest } = require('../protocol.cjs');

function fixture(t) {
  const documents = fs.mkdtempSync(path.join(os.tmpdir(),'vastu-desktop-'));
  t.after(()=>fs.rmSync(documents,{recursive:true,force:true}));
  return documents;
}
test('upgrading app preserves projects, preferences and plans and creates a complete backup', t => {
  const documents=fixture(t);
  let data=new DesktopData(documents,'1.1.2');
  const project=JSON.stringify({schemaVersion:1, projects:[{name:'Father house',rotation:90}], lastProjectId:'father'});
  data.setItem('vastu_workspace_v1',project);
  data.setItem('vastu_locale_v1','hi');
  const image=data.savePlan('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','image/png');
  data.close();
  data=new DesktopData(documents,'1.1.3');
  assert.equal(data.getItem('vastu_workspace_v1'),project);
  assert.equal(data.getItem('vastu_locale_v1'),'hi');
  assert(fs.existsSync(data.planPath(image.slice('vastu-plan:'.length))));
  const backups=fs.readdirSync(path.join(data.root,'backups'));
  assert.equal(backups.length,1);
  const backup=new DatabaseSync(path.join(data.root,'backups',backups[0],'projects.db'));
  assert.equal(backup.prepare("SELECT value FROM storage WHERE key='vastu_workspace_v1'").get().value,project);
  backup.close();
  assert.equal(fs.readdirSync(path.join(data.root,'backups',backups[0],'plans')).length,1);
  data.close();
  data=new DesktopData(documents,'1.1.3');
  assert.equal(fs.readdirSync(path.join(data.root,'backups')).length,1);
  data.close();
});
test('newer schemas and corrupt databases fail without resetting data', t=>{
  const documents=fixture(t),root=path.join(documents,'Vastu');fs.mkdirSync(root);
  const file=path.join(root,'projects.db');
  const db=new DatabaseSync(file);db.exec('PRAGMA user_version=100;');db.close();
  const original=fs.readFileSync(file);
  assert.throws(()=>new DesktopData(documents,'1.1.2'),/newer/);
  assert.deepEqual(fs.readFileSync(file),original);
  fs.writeFileSync(file,'corrupt-file-do-not-reset');
  assert.throws(()=>new DesktopData(documents,'1.1.2'));
  assert.equal(fs.readFileSync(file,'utf8'),'corrupt-file-do-not-reset');
});
test('storage and protocol reject arbitrary paths and remote origins',t=>{
  const documents=fixture(t),data=new DesktopData(documents,'1.1.2');
  assert.throws(()=>data.setItem('../../passwords','x'));
  assert.throws(()=>data.planPath('../projects.db'));
  assert.equal(resolveRequest('https://evil.example/',documents,data),null);
  assert.equal(resolveRequest('vastu://app/%2e%2e%5cprojects.db',documents,data),null);
  assert.throws(()=>resolveRequest('vastu://app/__plans/..%2fprojects.db',documents,data));
  data.close();
});
