const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const manifest=require('../renderer-manifest.json');
for(const asset of manifest.files){
  const file=path.resolve(root,asset.file);
  if(!file.startsWith(path.join(root,'desktop','web-dist')+path.sep))throw new Error('Invalid renderer path');
  if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==asset.sha256)throw new Error('Renderer changed without a refreshed manifest: '+asset.file);
}
console.log(`Verified ${manifest.files.length} offline Expo renderer assets.`);
