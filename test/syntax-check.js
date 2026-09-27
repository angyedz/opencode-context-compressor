'use strict';
const fs=require('fs');const path=require('path');const {spawnSync}=require('child_process');
for(const root of ['src','bin','test','bench']){walk(path.join(__dirname,'..',root));}
function walk(dir){if(!fs.existsSync(dir))return;for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(ent.isFile()&&p.endsWith('.js')){const r=spawnSync(process.execPath,['--check',p],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}}}
