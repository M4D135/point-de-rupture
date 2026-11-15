// Référence : recherche complète sur cases 4 m, monde.js SHA-256
// 491b0a0c762d8ae12d1cf8548f2b52857db76bc719390faf669772136f7c7235.
// La régénération est réservée à cette source historique, jamais à l'index testé.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const record=process.argv.includes('--record'),root=resolve(record?process.argv[2]:fileURLToPath(new URL('../..',import.meta.url)));
const hash=b=>createHash('sha256').update(b).digest('hex');
if(record)assert.equal(hash(readFileSync(join(root,'Jeu/src/sim/monde.js'))),'491b0a0c762d8ae12d1cf8548f2b52857db76bc719390faf669772136f7c7235');
const require=createRequire(import.meta.url);
for(const f of ['sim/regles.js','sim/protocole.js','ville.js','villes/marseille.js','ville-reelle.js','sim/nav.js','sim/immeubles.js','sim/monde.js','sim/ia.js','sim/travailleur.js'])require(join(root,'Jeu/src',f));
const {ville:V,regles:R,monde:M}=globalThis.PDR,results=[];
for(const seed of [3,17,96]){
 const v=V.creerVille(seed,{ilots:R.ilots(20000)}),m=M.creer(v,{graine:seed,effectifs:20000,vide:true,joueur:0,brouillard:false,ia:[]});
 const vehicle=R.TYPES.findIndex(t=>t.vehicule);
 for(const offset of [200,350,500]){
  const point=v.accrocher(v.etendue.x0+offset,v.etendue.z0+offset);
  // Plus de douze voisins, positions confondues et proches des limites à 1/4 m.
  for(let i=0;i<48;i++)m.ajouter(i%3,1,point[0]+(i<16?0:(i%4)*.18),point[1]+(i<16?0:((i/4)|0)%4*.18));
  if(vehicle>=0)m.ajouter(0,vehicle,point[0],point[1]);
 }
 for(let step=1;step<=200;step++){
  m.iterer();
  if([1,20,100,200].includes(step)){
   const h=createHash('sha256');
   for(const [name,value] of Object.entries(m).sort(([a],[b])=>a.localeCompare(b))){
    if(ArrayBuffer.isView(value)){h.update(name);h.update(Buffer.from(value.buffer,value.byteOffset,value.byteLength));}
   }
   results.push({seed,step,sha256:h.digest('hex')});
  }
 }
}
const file=new URL('./separation-reference.json',import.meta.url);
if(record)writeFileSync(file,JSON.stringify({source:'491b0a0c762d8ae12d1cf8548f2b52857db76bc719390faf669772136f7c7235',results},null,2)+'\n');
else assert.deepEqual(results,JSON.parse(readFileSync(file,'utf8')).results,'l’index fin doit conserver tous les tableaux exportés de la recherche de référence');
console.log(JSON.stringify({checks:results.length,identical:true}));
