// Référence : recherche complète sur cases 4 m, monde.js SHA-256
// 491b0a0c762d8ae12d1cf8548f2b52857db76bc719390faf669772136f7c7235.
// La régénération est réservée à cette source historique, jamais à l'index testé.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const record=process.argv.includes('--record'),root=resolve(record?process.argv[2]:fileURLToPath(new URL('../..',import.meta.url)));
const hash=b=>createHash('sha256').update(b).digest('hex');
if(record)assert.equal(hash(readFileSync(join(root,'Jeu/src/sim/monde.js'))),'491b0a0c762d8ae12d1cf8548f2b52857db76bc719390faf669772136f7c7235');
const require=createRequire(import.meta.url);
for(const f of ['sim/regles.js','sim/protocole.js','ville.js','villes/marseille.js','ville-reelle.js','sim/nav.js','sim/immeubles.js','sim/monde.js','sim/ia.js','sim/travailleur.js'])require(join(root,'Jeu/src',f));
const {ville:V,regles:R,monde:M}=globalThis.PDR,results=[],reference=[];
// La peur change volontairement les trajectoires et ajoute deux tables. On conserve les goldens historiques
// sans les régénérer : désormais, mêmes règles courantes des deux côtés, seul l'algorithme de séparation diffère.
let MR=M;
if(!record){
 const source=readFileSync(join(root,'Jeu/src/sim/monde.js'),'utf8');
 const start=source.indexOf('    function separer() {'),end=source.indexOf('    function deplacer(',start);
 assert.ok(start>=0 && end>start);
 const simple=readFileSync(new URL('./fixtures/separer-reference.js',import.meta.url),'utf8');
 vm.runInThisContext(source.slice(0,start)+simple+source.slice(end),{filename:'monde-reference-separation.js'});
 MR=globalThis.PDR.monde; globalThis.PDR.monde=M;
}
function digest(m){
 const h=createHash('sha256');
 for(const [name,value] of Object.entries(m).sort(([a],[b])=>a.localeCompare(b))){
  if(ArrayBuffer.isView(value)){h.update(name);h.update(Buffer.from(value.buffer,value.byteOffset,value.byteLength));}
 }
 return h.digest('hex');
}
for(const seed of [3,17,96]){
 const v=V.creerVille(seed,{ilots:R.ilots(20000)}),m=M.creer(v,{graine:seed,effectifs:20000,vide:true,joueur:0,brouillard:false,ia:[]});
 const mr=record?null:MR.creer(v,{graine:seed,effectifs:20000,vide:true,joueur:0,brouillard:false,ia:[]});
 const worlds=mr?[m,mr]:[m];
 const vehicle=R.TYPES.findIndex(t=>t.vehicule);
 for(const offset of [200,350,500]){
  const point=v.accrocher(v.etendue.x0+offset,v.etendue.z0+offset);
  // Plus de douze voisins, positions confondues et proches des limites à 1/4 m.
  for(const world of worlds) for(let i=0;i<48;i++)world.ajouter(i%3,1,point[0]+(i<16?0:(i%4)*.18),point[1]+(i<16?0:((i/4)|0)%4*.18));
  if(vehicle>=0)for(const world of worlds)world.ajouter(0,vehicle,point[0],point[1]);
 }
 for(let step=1;step<=200;step++){
  for(const world of worlds)world.iterer();
  if([1,20,100,200].includes(step)){
   results.push({seed,step,sha256:digest(m)});
   if(mr)reference.push({seed,step,sha256:digest(mr)});
  }
 }
}
const file=new URL('./separation-reference.json',import.meta.url);
if(record)writeFileSync(file,JSON.stringify({source:'491b0a0c762d8ae12d1cf8548f2b52857db76bc719390faf669772136f7c7235',results},null,2)+'\n');
else assert.deepEqual(results,reference,'l’index fin doit conserver tous les tableaux exportés de la recherche exhaustive, peur comprise');
console.log(JSON.stringify({checks:results.length,identical:true}));
