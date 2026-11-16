/* FERRO recipes v1 — portable authoring source, no DOM, GPU or game globals.
 * validate/decode return normalized independent data; encode is canonical JSON.
 * compile expands a validated DAG to frozen FERRO meshes + source ownership.
 * createCompiler has a bounded LRU and cumulative .stats; compile only on edits.
 * createHistory.current is frozen; commit/undo/redo return the current snapshot.
 * Units: metres, radians, linear RGB. Rotation uses the renderer's Rz*Ry*Rx.
 */
(function(root){'use strict';
const FORMAT='ferro-recipe',VERSION=1,MAX_BYTES=1048576,MAX_NODES=256,MAX_INSTANCES=10000;
const SHAPES=new Set(['box','sphere','cylinder','octa','ring','bevel','wedge']);
const KINDS=new Set([0,1,2,3,4,5,6,7,8,9,10,13,14,15,19,20]);
const fail=message=>{throw new TypeError('Recette FERRO : '+message);};
function object(v,label){if(!v||typeof v!=='object'||Array.isArray(v))fail(label+' doit être un objet.');return v;}
function number(v,min,max,label,integer=false){if(!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))fail(label+' doit être '+(integer?'un entier':'un nombre fini')+' entre '+min+' et '+max+'.');return Object.is(v,-0)?0:v;}
function label(v,what){if(typeof v!=='string'||!v.trim()||v.length>100)fail(what+' : texte de 1 à 100 caractères requis.');return v.trim();}
function id(v,what){if(typeof v!=='string'||!(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/).test(v))fail(what+' : identifiant invalide.');return v;}
function vector(v,min,max,what){if(!Array.isArray(v)||v.length!==3)fail(what+' doit contenir trois nombres.');return v.map((x,i)=>number(x,min,max,what+' ['+i+']'));}
function list(v,max,what){if(!Array.isArray(v)||v.length>max)fail(what+' : liste de '+max+' éléments maximum requise.');return v;}
function unique(values,what){const seen=new Set();for(const value of values){if(seen.has(value))fail(what+' en double : '+value+'.');seen.add(value);}return seen;}
function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;}
const copy=v=>JSON.parse(JSON.stringify(v));
function validate(source){
 object(source,'La source');if(source.format!==FORMAT)fail('format inconnu.');if(source.version!==VERSION)fail('version '+String(source.version)+' non prise en charge.');
 const out={format:FORMAT,version:VERSION,name:label(source.name,'Nom de scène'),seed:number(source.seed,0,4294967295,'Graine',true),materials:[],nodes:[],roots:[]};
 out.materials=list(source.materials,64,'Matériaux').map((m,i)=>{object(m,'Matériau '+i);if(!KINDS.has(m.kind))fail('procédure de matériau inconnue.');return {id:id(m.id,'Matériau'),name:label(m.name,'Nom du matériau'),kind:m.kind,color:vector(m.color,0,1,'Couleur'),emissive:number(m.emissive,0,8,'Émission')};});
 if(!out.materials.length)fail('au moins un matériau est requis.');const materialIds=unique(out.materials.map(m=>m.id),'Matériau');
 out.nodes=list(source.nodes,MAX_NODES,'Opérations').map((n,i)=>{object(n,'Opération '+i);const base={id:id(n.id,'Opération'),name:label(n.name,'Nom de l’opération'),op:n.op};
  if(n.op==='primitive'){if(!SHAPES.has(n.shape))fail('forme inconnue : '+String(n.shape)+'.');if(!materialIds.has(n.material))fail('matériau manquant : '+String(n.material)+'.');return {...base,shape:n.shape,material:n.material,p:vector(n.p,-10000,10000,'Position'),s:vector(n.s,.001,1000,'Dimensions'),r:vector(n.r,-20*Math.PI,20*Math.PI,'Rotation')};}
  if(n.op==='repeat')return {...base,input:id(n.input,'Source de répétition'),count:number(n.count,1,256,'Nombre de répétitions',true),step:vector(n.step,-10000,10000,'Décalage'),jitter:vector(n.jitter,0,1000,'Variation')};
  if(n.op==='group'){const inputs=list(n.inputs,MAX_NODES,'Sources du groupe').map(x=>id(x,'Source de groupe'));unique(inputs,'Source de groupe');return {...base,inputs};}
  fail('opération inconnue : '+String(n.op)+'.');
 });
 const nodeIds=unique(out.nodes.map(n=>n.id),'Opération'),nodes=new Map(out.nodes.map(n=>[n.id,n]));
 out.roots=list(source.roots,MAX_NODES,'Racines').map(x=>id(x,'Racine'));unique(out.roots,'Racine');
 for(const n of out.nodes)for(const ref of n.op==='repeat'?[n.input]:n.inputs||[])if(!nodeIds.has(ref))fail('source manquante : '+ref+'.');
 for(const ref of out.roots)if(!nodeIds.has(ref))fail('racine manquante : '+ref+'.');
 const visited=new Map(),counts=new Map();
 function count(ref){if(visited.get(ref)===1)fail('cycle détecté autour de '+ref+'.');if(visited.get(ref)===2)return counts.get(ref);visited.set(ref,1);const n=nodes.get(ref);let result=n.op==='primitive'?1:n.op==='repeat'?count(n.input)*n.count:n.inputs.reduce((sum,x)=>Math.min(MAX_INSTANCES+1,sum+count(x)),0);result=Math.min(MAX_INSTANCES+1,result);visited.set(ref,2);counts.set(ref,result);return result;}
 // Validate every component, including nodes not currently exposed as roots.
 for(const n of out.nodes)count(n.id);
 if(out.roots.reduce((sum,ref)=>sum+counts.get(ref),0)>MAX_INSTANCES)fail('expansion supérieure à '+MAX_INSTANCES+' instances. Réduisez les répétitions.');
 return out;
}
function byteLength(text){return typeof TextEncoder!=='undefined'?new TextEncoder().encode(text).length:encodeURIComponent(text).replace(/%[A-F\d]{2}|./g,'x').length;}
function encode(recipe){return JSON.stringify(validate(recipe),null,2)+'\n';}
function decode(text){if(typeof text!=='string'||text.length>MAX_BYTES||byteLength(text)>MAX_BYTES)fail('fichier trop volumineux (1 Mo maximum).');let value;try{value=JSON.parse(text);}catch{fail('JSON invalide.');}return validate(value);}
function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return (h^(h>>>16))>>>0;}
function generate(recipe){
 const nodes=new Map(recipe.nodes.map(n=>[n.id,n])),materials=new Map(recipe.materials.map(m=>[m.id,m])),meshes=[],owners=[];
 function expand(ref,offset,rootId,path){const n=nodes.get(ref);
  if(n.op==='primitive'){const m=materials.get(n.material),p=n.p.map((v,i)=>v+offset[i]);if(p.some(v=>!Number.isFinite(v)||Math.abs(v)>10000))fail('position générée hors de la zone ±10000 m.');meshes.push({shape:n.shape,p,s:n.s.slice(),r:n.r.slice(),color:m.color.slice(),mat:m.kind,emissive:m.emissive,outdoor:true,surface:'object'});owners.push({primitive:n.id,root:rootId,path});}
  else if(n.op==='group'){for(const child of n.inputs)expand(child,offset,rootId,path+'/'+child);}
  else for(let i=0;i<n.count;i++){const next=offset.map((v,axis)=>v+i*n.step[axis]+(hash(recipe.seed+':'+path+':'+n.id+':'+i+':'+axis)/4294967295*2-1)*n.jitter[axis]);expand(n.input,next,rootId,path+'/'+i);}
 }
 for(const ref of recipe.roots)expand(ref,[0,0,0],ref,ref);
 return freeze({meshes,owners,stats:{instances:meshes.length,nodes:recipe.nodes.length}});
}
function compile(recipe){return generate(validate(recipe));}
function createCompiler({limit=32}={}){
 number(limit,1,128,'Limite du cache',true);const cache=new Map();let hits=0,misses=0;
 return {compile(source){const recipe=validate(source),key=JSON.stringify(recipe);let result=cache.get(key);if(result){hits++;cache.delete(key);cache.set(key,result);return result;}misses++;result=generate(recipe);cache.set(key,result);while(cache.size>limit)cache.delete(cache.keys().next().value);return result;},clear(){cache.clear();hits=misses=0;},get stats(){return {entries:cache.size,hits,misses,limit};}};
}
function createHistory(initial,{limit=80}={}){
 number(limit,2,256,'Limite d’historique',true);const snapshot=value=>{const normalized=validate(value);generate(normalized);return freeze(normalized);};let list=[snapshot(initial)],index=0;
 return {get current(){return list[index];},get canUndo(){return index>0;},get canRedo(){return index<list.length-1;},commit(value){const next=snapshot(value);if(JSON.stringify(next)===JSON.stringify(list[index]))return list[index];list=list.slice(0,index+1);list.push(next);if(list.length>limit)list.shift();index=list.length-1;return list[index];},undo(){if(index>0)index--;return list[index];},redo(){if(index<list.length-1)index++;return list[index];}};
}
function exportModule(source){const json=encode(source).trim().replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');return '/* FERRO recipe v1. Load src/ferro/recipes.js in each game. No baked mesh assets. */\nexport const recipe = '+json+';\nexport default function generate(FRecipes, seed = recipe.seed) {\n  if (!FRecipes || FRecipes.version !== 1) throw new Error("FERRO recipes v1 requis");\n  return FRecipes.compile({...recipe, seed});\n}\n';}
function demo(){
 const materials=[{id:'concrete',name:'Béton coquille',kind:3,color:[.66,.65,.57],emissive:0},{id:'orange',name:'Acier signal',kind:0,color:[.92,.29,.075],emissive:0},{id:'dark',name:'Acier pétrole',kind:0,color:[.12,.25,.27],emissive:0},{id:'wood',name:'Bois des caisses',kind:10,color:[.45,.28,.12],emissive:0},{id:'stone',name:'Enduit sable',kind:13,color:[.72,.65,.51],emissive:0}];
 const primitive=(id,name,shape,material,p,s,r=[0,0,0])=>({id,name,op:'primitive',shape,material,p,s,r});
 const repeat=(id,name,input,count,step,jitter=[0,0,0])=>({id,name,op:'repeat',input,count,step,jitter});
 const nodes=[primitive('quai','Plateforme du quai','bevel','concrete',[0,-.35,0],[17,.7,12]),primitive('pied','Pied du portique','bevel','orange',[-4.2,2.6,-2],[.42,5.2,.55]),repeat('pieds','Montants du portique','pied',2,[8.4,0,0]),primitive('poutre','Traverse du portique','bevel','orange',[0,5.25,-2],[9.3,.5,.6]),primitive('rail','Rail de levage','box','dark',[0,4.91,-2],[9.3,.14,.2]),primitive('cable','Câble de levage','cylinder','dark',[.6,3.95,-2],[.07,1.8,.07]),primitive('charge','Charge suspendue','bevel','wood',[.6,2.65,-2],[1.7,1.3,1.5]),primitive('caisse','Caisse de stockage','bevel','wood',[-5,.6,1.4],[1.2,1.2,1.2]),repeat('caisses','Caisses en rangée','caisse',4,[1.5,0,0],[.08,0,.15]),primitive('baril','Fût métallique','cylinder','dark',[3.6,.7,2],[.85,1.4,.85]),repeat('barils','Série de fûts','baril',3,[1.2,0,0],[.06,0,.08]),primitive('bollard','Borne de quai','cylinder','orange',[-7,.34,4.8],[.28,.68,.28]),repeat('bornes','Alignement du quai','bollard',9,[1.75,0,0]),primitive('mur','Muret de fond','bevel','stone',[0,.8,-5.3],[16,1.6,.35]),primitive('dalle','Joints de pavage','box','dark',[-7.5,.005,0],[.025,.01,11])];
 // The last stripe remains a primitive; all repetition is explicit and editable.
 return validate({format:FORMAT,version:VERSION,name:'Le quai des possibles',seed:135,materials,nodes,roots:['quai','pieds','poutre','rail','cable','charge','caisses','barils','bornes','mur','dalle']});
}
root.FRecipes=Object.freeze({version:VERSION,validate,encode,decode,compile,createCompiler,createHistory,exportModule,demo,limits:Object.freeze({bytes:MAX_BYTES,nodes:MAX_NODES,instances:MAX_INSTANCES})});
})(globalThis);
