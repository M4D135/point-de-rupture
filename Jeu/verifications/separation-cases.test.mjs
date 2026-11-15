import {createRequire} from 'node:module';
import {fileURLToPath} from "node:url";
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(fileURLToPath(new URL("../..", import.meta.url)));
const require=createRequire(import.meta.url);
for(const f of ['sim/regles.js','sim/protocole.js','ville.js','villes/marseille.js','ville-reelle.js','sim/nav.js','sim/immeubles.js','sim/monde.js','sim/ia.js','sim/travailleur.js'])require(join(root,'Jeu/src',f));
const {ville:V,regles:R,monde:M}=globalThis.PDR;
const results=[];
for(const offset of [200,350,500]){
 const v=V.creerVille(3,{ilots:R.ilots(20000)});
 const m=M.creer(v,{graine:3,effectifs:20000,vide:true,joueur:0,brouillard:false,ia:[]});
 const point=v.accrocher(v.etendue.x0+offset,v.etendue.z0+offset);
 const a=m.ajouter(0,1,point[0],point[1]),b=m.ajouter(0,1,point[0],point[1]);
 const before=Math.hypot(m.ux[a]-m.ux[b],m.uz[a]-m.uz[b]);
 for(let i=0;i<20;i++)m.iterer();
 const after=Math.hypot(m.ux[a]-m.ux[b],m.uz[a]-m.uz[b]);
 results.push({offset,point,before_mm:before,after_mm:after,separated:after>=250});
}
console.log(JSON.stringify({root,results},null,2));
assert.ok(results.every(r=>r.separated),'les figurines superposées restent collées hors de la première case');
