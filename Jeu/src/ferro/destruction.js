/* FERRO — persistent local demolition, without a voxel world or imported assets. */
(function(G){
  'use strict';
  const EPS=1e-6,MAX_PARTS=12,MAX_CUTS=12,MAX_DEBRIS=48,KEYS=['minX','maxX','minY','maxY','minZ','maxZ'];
  const finite=Number.isFinite,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const validPoint=p=>Array.isArray(p)&&p.length===3&&p.every(finite);
  const volume=b=>Math.max(0,b.maxX-b.minX)*Math.max(0,b.maxY-b.minY)*Math.max(0,b.maxZ-b.minZ);
  const copyBox=b=>Object.fromEntries(KEYS.map(k=>[k,b[k]]));
  const overlaps=(a,b)=>a.minX<b.maxX-EPS&&a.maxX>b.minX+EPS&&a.minY<b.maxY-EPS&&a.maxY>b.minY+EPS&&a.minZ<b.maxZ-EPS&&a.maxZ>b.minZ+EPS;
  const distance=(p,b)=>Math.hypot(Math.max(b.minX-p[0],0,p[0]-b.maxX),Math.max(b.minY-p[1],0,p[1]-b.maxY),Math.max(b.minZ-p[2],0,p[2]-b.maxZ));
  let foliageSource,foliageFaces;
  function sharedFoliage(){
    const triangles=G.FRender?.foliageTriangles?.();
    if(!Array.isArray(triangles)||!triangles.length)throw new Error('Foliage destruction requires the shared FRender geometry.');
    if(triangles===foliageSource)return foliageFaces;
    foliageSource=triangles;
    // One shared set of edges for the whole scene, not 72 copied triangles per
    // tree. The renderer and shots use exactly the same irregular silhouette.
    foliageFaces=triangles.map(([a,b,c])=>{
      const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
      return {a,ab,ac,n:[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]]};
    });
    return foliageFaces;
  }
  function rotation(r=[0,0,0]){
    const [x,y,z]=r,a=Math.cos(x),b=Math.sin(x),c=Math.cos(y),d=Math.sin(y),e=Math.cos(z),f=Math.sin(z);
    return [e*c,e*d*b-f*a,e*d*a+f*b,f*c,f*d*b+e*a,f*d*a-e*b,-d,c*b,c*a];
  }
  // Bounded local cells, sampled only after their dimensions are fixed. Missing
  // volume is explicit crumble, never a giant rigid plate kept to save slots.
  function fragment(mesh,limit=40,maxEdge=1.4){
    const size=mesh.s,counts=size.map(n=>Math.max(1,Math.ceil(n/maxEdge))),total=counts.reduce((a,b)=>a*b,1),count=Math.min(Math.max(0,Math.floor(limit)),total),shape=mesh.shape||'box',factor=({sphere:Math.PI/6,cylinder:Math.PI/4,octa:1/6,ring:2*Math.PI*Math.PI*.435*.065*.065,foliage:.55}[shape]||1),volume=size.reduce((a,b)=>a*b,1)*factor,a=rotation(mesh.r),pieces=[];
    for(let i=0;i<count;i++){let cell=Math.min(total-1,Math.floor((i+.5)*total/count));const local=[];for(let k=0;k<3;k++){const at=cell%counts[k];cell=Math.floor(cell/counts[k]);local[k]=-size[k]/2+(at+.5)*size[k]/counts[k];}pieces.push({mesh:{...mesh,shape:total>1&&!['box','bevel','foliage'].includes(shape)?'bevel':shape,p:mesh.p.map((v,k)=>v+a[k*3]*local[0]+a[k*3+1]*local[1]+a[k*3+2]*local[2]),s:size.map((v,k)=>v/counts[k]),structural:true,fragment:true},volume:volume/total});}
    return {pieces,total,volume,crumbleVolume:Math.max(0,volume-volume*count/total)};
  }
  function bounds(m){
    const a=rotation(m.r),p=m.p||[0,0,0],s=m.s||[1,1,1],h=[0,1,2].map(i=>(Math.abs(a[i*3]*s[0])+Math.abs(a[i*3+1]*s[1])+Math.abs(a[i*3+2]*s[2]))/2);
    return {minX:p[0]-h[0],maxX:p[0]+h[0],minY:p[1]-h[1],maxY:p[1]+h[1],minZ:p[2]-h[2],maxZ:p[2]+h[2]};
  }
  function union(boxes){return Object.fromEntries(KEYS.map(k=>[k,Math[k.startsWith('min')?'min':'max'](...boxes.map(b=>b[k]))]));}
  // A box minus one box is at most six disjoint solids. Keeping the exact same
  // bounds for render pieces and collision pieces makes the breach physical.
  function subtract(a,b,minimum=EPS){
    if(!overlaps(a,b))return [a];
    const lo=[Math.max(a.minX,b.minX),Math.max(a.minY,b.minY),Math.max(a.minZ,b.minZ)],hi=[Math.min(a.maxX,b.maxX),Math.min(a.maxY,b.maxY),Math.min(a.maxZ,b.maxZ)];
    // Thin rails, sheet metal and cladding are real geometry too. A fixed .035 m
    // minimum used to erase the entire sheet as soon as one small cut touched it.
    const pieces=[],push=(x0,x1,y0,y1,z0,z1)=>{if(x1-x0>minimum&&y1-y0>minimum&&z1-z0>minimum)pieces.push({minX:x0,maxX:x1,minY:y0,maxY:y1,minZ:z0,maxZ:z1});};
    push(a.minX,lo[0],a.minY,a.maxY,a.minZ,a.maxZ);push(hi[0],a.maxX,a.minY,a.maxY,a.minZ,a.maxZ);
    push(lo[0],hi[0],a.minY,lo[1],a.minZ,a.maxZ);push(lo[0],hi[0],hi[1],a.maxY,a.minZ,a.maxZ);
    push(lo[0],hi[0],lo[1],hi[1],a.minZ,lo[2]);push(lo[0],hi[0],lo[1],hi[1],hi[2],a.maxZ);
    return pieces;
  }
  function meshBox(m,b,id){return {...m,shape:'box',p:[(b.minX+b.maxX)/2,(b.minY+b.maxY)/2,(b.minZ+b.maxZ)/2],s:[b.maxX-b.minX,b.maxY-b.minY,b.maxZ-b.minZ],r:[0,0,0],destructibleId:id,fragment:true};}
  function rayBox(origin,dir,b,limit=Infinity){
    let enter=0,leave=limit,normal=[0,0,0];
    for(let i=0;i<3;i++){
      const lo=b[KEYS[i*2]],hi=b[KEYS[i*2+1]],v=dir[i];
      if(Math.abs(v)<1e-10){if(origin[i]<lo||origin[i]>hi)return null;continue;}
      let a=(lo-origin[i])/v,c=(hi-origin[i])/v,sign=-1;if(a>c){[a,c]=[c,a];sign=1;}
      if(a>enter){enter=a;normal=[0,0,0];normal[i]=sign;}leave=Math.min(leave,c);if(enter>leave)return null;
    }
    return leave>=0&&enter<=limit?{distance:Math.max(0,enter),normal,leave}:null;
  }
  function rayMesh(o,d,e,limit){
    const hit=rayBox(o,d,e.bounds,limit);if(!hit)return null;
    const m=e.mesh,a=e.rotation,p=m.p,s=m.s,offset=o.map((v,i)=>v-p[i]);
    const local=v=>[0,1,2].map(i=>(a[i]*v[0]+a[i+3]*v[1]+a[i+6]*v[2])/s[i]),q=local(offset),v=local(d),shape=m.shape||'box';
    const point=t=>q.map((x,i)=>x+v[i]*t),normal=t=>{
      const p=point(t),n=shape==='sphere'?p:shape==='cylinder'?(Math.abs(Math.abs(p[1])-.5)<.002?[0,Math.sign(p[1]),0]:[p[0],0,p[2]]):p.map(Math.sign);
      const scaled=n.map((x,i)=>x/s[i]),world=[0,1,2].map(i=>a[i*3]*scaled[0]+a[i*3+1]*scaled[1]+a[i*3+2]*scaled[2]),length=Math.hypot(...world)||1;return world.map(x=>x/length);
    };
    let t=null;
    if(shape==='box'||shape==='bevel'){
      const b=rayBox(q,v,{minX:-.5,maxX:.5,minY:-.5,maxY:.5,minZ:-.5,maxZ:.5},limit);
      if(!b)return null;const n=b.normal,t=b.distance;return {distance:t,normal:[0,1,2].map(i=>a[i*3]*n[0]+a[i*3+1]*n[1]+a[i*3+2]*n[2])};
    }
    if(shape==='foliage'){
      let nearest=limit,face=null;
      // Two-sided Möller–Trumbore in local coordinates. Keeping v unnormalised
      // preserves world-space distances under rotation and non-uniform scale.
      for(const f of e.triangles){
        const u=f.ab,w=f.ac,h=[v[1]*w[2]-v[2]*w[1],v[2]*w[0]-v[0]*w[2],v[0]*w[1]-v[1]*w[0]],det=u[0]*h[0]+u[1]*h[1]+u[2]*h[2];
        if(Math.abs(det)<1e-10)continue;
        const iq=1/det,dx=q[0]-f.a[0],dy=q[1]-f.a[1],dz=q[2]-f.a[2],b=(dx*h[0]+dy*h[1]+dz*h[2])*iq;
        if(b< -1e-8||b>1+1e-8)continue;
        const cross=[dy*u[2]-dz*u[1],dz*u[0]-dx*u[2],dx*u[1]-dy*u[0]],c=(v[0]*cross[0]+v[1]*cross[1]+v[2]*cross[2])*iq;
        if(c< -1e-8||b+c>1+1e-8)continue;
        const at=(w[0]*cross[0]+w[1]*cross[1]+w[2]*cross[2])*iq;
        if(at>=0&&at<=nearest){nearest=at;face=f;}
      }
      if(!face)return null;
      const n=face.n.map((v,i)=>v/s[i]),out=[0,1,2].map(i=>a[i*3]*n[0]+a[i*3+1]*n[1]+a[i*3+2]*n[2]),length=Math.hypot(...out)||1;
      return {distance:nearest,normal:out.map(v=>v/length)};
    }
    if(shape==='sphere'||shape==='cylinder'){
      const axes=shape==='sphere'?[0,1,2]:[0,2],aa=axes.reduce((n,i)=>n+v[i]*v[i],0),bb=axes.reduce((n,i)=>n+q[i]*v[i],0),cc=axes.reduce((n,i)=>n+q[i]*q[i],0)-.25,disc=bb*bb-aa*cc;
      const roots=[];if(aa>EPS&&disc>=0)roots.push((-bb-Math.sqrt(disc))/aa,(-bb+Math.sqrt(disc))/aa);
      if(shape==='cylinder'&&Math.abs(v[1])>EPS)for(const sign of [-1,1]){const at=(sign*.5-q[1])/v[1],p=point(at);if(p[0]*p[0]+p[2]*p[2]<=.25+EPS)roots.push(at);}
      t=roots.filter(t=>t>=0&&t<=limit&&(shape==='sphere'||Math.abs(point(t)[1])<=.5+EPS)).sort((a,b)=>a-b)[0];
    }else if(shape==='octa'){
      let enter=0,leave=limit;
      for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
        const start=x*q[0]+y*q[1]+z*q[2]-.5,speed=x*v[0]+y*v[1]+z*v[2];
        if(Math.abs(speed)<EPS){if(start>0)return null;}else if(speed<0)enter=Math.max(enter,-start/speed);else leave=Math.min(leave,-start/speed);
      }
      if(enter<=leave)t=enter;
    }else if(shape==='ring'){
      // The hollow torus remains hollow to shots; never use its filled AABB.
      const speed=Math.hypot(...v);let at=hit.distance;
      for(let i=0;i<72&&at<=Math.min(limit,hit.leave);i++){
        const p=point(at),sd=Math.hypot(Math.hypot(p[0],p[2])-.435,p[1])-.065;
        if(sd<.0015){t=at;break;}at+=Math.max(.0002,sd*.85/(speed||1));
      }
    }
    return finite(t)&&t>=0&&t<=limit?{distance:t,normal:normal(t)}:null;
  }
  function anchored(parts,base){
    const keep=new Set(),queue=[];
    parts.forEach((p,i)=>{if(p.minY<=base+.04){keep.add(i);queue.push(i);}});
    for(let k=0;k<queue.length;k++)for(let i=0;i<parts.length;i++)if(!keep.has(i)){
      const a=parts[queue[k]],b=parts[i],touch=[Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX),Math.min(a.maxY,b.maxY)-Math.max(a.minY,b.minY),Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ)];
      if(touch.every(v=>v>=-EPS)&&touch.filter(v=>v>.01).length>=2){keep.add(i);queue.push(i);}
    }
    return parts.filter((_,i)=>keep.has(i));
  }
  function create(world,rules={}){
    const originalMeshes=world.meshes||[],originalColliders=world.colliders||[],groups=new Map(),meshOwner=new Map(),states=new Map(),leaked=new Set();
    let meshes=originalMeshes.slice(),colliders=null,unclaimedBoxes=[],lights=(world.lights||[]).slice(),revision=0,meshGeneration=0,meshDelta=null;
    let token=Object.freeze({}),previousToken=null,previousSnapshot=null,lastDelta=null,emptyDelta=null,deltaEnabled=false;const stableUnclaimed=new Map();
    const definitions=world.destructibles||originalMeshes.map((m,i)=>m.ground||m.terrain?null:{id:'mesh-'+i,kind:'prop',strength:5,meshes:[i],colliders:originalColliders.flatMap((c,j)=>c.mesh===i?[j]:[])}).filter(Boolean);
    const foliage=originalMeshes.some(m=>m.shape==='foliage')?sharedFoliage():null;
    const entries=originalMeshes.map((mesh,source)=>({mesh,source,bounds:bounds(mesh),rotation:rotation(mesh.r),triangles:mesh.shape==='foliage'?foliage:null}));
    for(const d of definitions){
      const members=d.meshes.filter(i=>entries[i]);if(!members.length)continue;
      const g={...d,id:String(d.id),strength:d.strength||6,meshes:members,colliders:(d.colliders||[]).filter(i=>originalColliders[i]),bounds:d.bounds||union(members.map(i=>entries[i].bounds)),active:members.map(i=>entries[i]),solids:[],originalVolume:0,rebuildOrder:groups.size};
      g.originalVolume=g.colliders.reduce((v,i)=>v+volume(originalColliders[i]),0);groups.set(g.id,g);for(const i of members)meshOwner.set(i,g.id);
    }
    // Support relationships are immutable. Keep their order and cache each
    // group's exact volume when its solids change, instead of rebuilding the
    // support graph and summing every unchanged fragment after every blast.
    const supported=[...groups.values()].filter(g=>g.supports?.length);
    for(let i=0;i<supported.length;i++){const g=supported[i];g.supportNodes=g.supports.map(id=>groups.get(String(id))).filter(Boolean);g.supportVolume=g.supportNodes.reduce((n,q)=>n+q.originalVolume,0);for(const node of g.supportNodes)(node.supportedBy||(node.supportedBy=[])).push(i);}
    const supportPending=new Set(),supportQueued=new Uint8Array(supported.length);let supportQueue=null,supportCursor=-1;
    function dirtySupport(i){
      // The old pass visits each roof once in definition order. A dependency
      // changed after that visit belongs to the next changed damage operation.
      if(!supportQueue||i<=supportCursor){supportPending.add(i);return;}
      if(supportQueued[i])return;supportQueued[i]=1;let at=supportQueue.length;supportQueue.push(i);
      while(at){const parent=(at-1)>>1;if(supportQueue[parent]<=i)break;supportQueue[at]=supportQueue[parent];at=parent;}supportQueue[at]=i;
    }
    function nextSupported(){
      const i=supportQueue[0],last=supportQueue.pop();supportQueued[i]=0;
      if(supportQueue.length){let at=0;while(at*2+1<supportQueue.length){let child=at*2+1;if(child+1<supportQueue.length&&supportQueue[child+1]<supportQueue[child])child++;if(supportQueue[child]>=last)break;supportQueue[at]=supportQueue[child];at=child;}supportQueue[at]=last;}
      supportCursor=i;return supported[i];
    }
    function supportFails(g){return g.supportVolume>0&&g.supportNodes.reduce((n,q)=>n+q.solidVolume,0)/g.supportVolume<(g.supportRatio||.38);}
    function seedSupports(){
      // Initialization/restoration may contain already unsupported roofs or a
      // ratio above one. Record them now, without eagerly collapsing anything.
      supportPending.clear();for(let i=0;i<supported.length;i++)if(isAlive(supported[i].id)&&supportFails(supported[i]))supportPending.add(i);
    }
    let solidCount=0;
    function geometryFor(g,built){geometryDirty.add(g);solidCount+=built.solids.length-g.solids.length;g.active=built.active;g.solids=built.solids;const before=g.solidVolume;g.solidVolume=g.solids.reduce((n,q)=>n+volume(q.bounds),0);if(!Object.is(before,g.solidVolume))for(const i of g.supportedBy||[])dirtySupport(i);g.pendingBuilt=built;g.pendingRecord=states.get(g.id);}
    const cells=new Map(),size=8;
    for(const g of groups.values())for(let x=Math.floor(g.bounds.minX/size);x<=Math.floor(g.bounds.maxX/size);x++)for(let z=Math.floor(g.bounds.minZ/size);z<=Math.floor(g.bounds.maxZ/size);z++){
      const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(g);
    }
    let signature=2166136261;for(const c of JSON.stringify([world.seed,world.stage,world.generation,definitions.map(d=>[d.id,d.bounds,d.meshes,d.colliders]),world.pipes||[]]))signature=Math.imul(signature^c.charCodeAt(0),16777619);signature=(signature>>>0).toString(36);
    const query=b=>{const found=new Set();for(let x=Math.floor(b.minX/size);x<=Math.floor(b.maxX/size);x++)for(let z=Math.floor(b.minZ/size);z<=Math.floor(b.maxZ/size);z++)for(const g of cells.get(x+','+z)||[])found.add(g);return Array.from(found);};
    const isAlive=id=>id===undefined||id===null||!states.get(String(id))?.removed;
    function compile(g,record){
      if(record?.removed)return {active:[],solids:[]};
      const cuts=record?.cuts||[],active=[],solids=[];
      for(const ci of g.colliders){
        const c=originalColliders[ci],source=originalMeshes[c.mesh];
        if(cuts.length&&source?.shape==='box'&&source.r?.some(v=>Math.abs(v)>EPS)){
          const a=rotation(source.r),local={minX:-source.s[0]/2,maxX:source.s[0]/2,minY:-source.s[1]/2,maxY:source.s[1]/2,minZ:-source.s[2]/2,maxZ:source.s[2]/2};let pieces=[local];
          for(const cut of cuts){const ps=[];for(const x of [cut.minX,cut.maxX])for(const y of [cut.minY,cut.maxY])for(const z of [cut.minZ,cut.maxZ]){const d=[x-source.p[0],y-source.p[1],z-source.p[2]];ps.push([0,1,2].map(k=>a[k]*d[0]+a[k+3]*d[1]+a[k+6]*d[2]));}const clip={minX:Math.min(...ps.map(p=>p[0])),maxX:Math.max(...ps.map(p=>p[0])),minY:Math.min(...ps.map(p=>p[1])),maxY:Math.max(...ps.map(p=>p[1])),minZ:Math.min(...ps.map(p=>p[2])),maxZ:Math.max(...ps.map(p=>p[2]))};pieces=pieces.flatMap(p=>subtract(p,clip,.035));}
          if(g.kind!=='roof'&&g.kind!=='decor')pieces=anchored(pieces,local.minY);
          for(const q of pieces){const center=[(q.minX+q.maxX)/2,(q.minY+q.maxY)/2,(q.minZ+q.maxZ)/2],mesh={...source,p:source.p.map((v,k)=>v+a[k*3]*center[0]+a[k*3+1]*center[1]+a[k*3+2]*center[2]),s:[q.maxX-q.minX,q.maxY-q.minY,q.maxZ-q.minZ],fragment:true,destructibleId:g.id};solids.push({bounds:bounds(mesh),source:ci,meshIndex:c.mesh,mesh});}continue;
        }
        let pieces=[copyBox(c)];for(const cut of cuts)pieces=pieces.flatMap(p=>subtract(p,cut,.035));
        if(g.kind!=='roof'&&g.kind!=='decor')pieces=anchored(pieces,c.minY);
        for(const b of pieces)solids.push({bounds:b,source:ci,meshIndex:c.mesh});
      }
      for(const i of g.meshes){
        const e=entries[i],m=e.mesh,solidParts=solids.filter(q=>q.meshIndex===i);
        if(g.colliders.some(ci=>originalColliders[ci].mesh===i)){
          for(const p of solidParts){const mesh=cuts.length?(p.mesh||meshBox(m,p.bounds,g.id)):m;active.push({mesh,source:i,bounds:p.bounds,rotation:rotation(mesh.r),solid:p});}continue;
        }
        if(!cuts.length){active.push(e);continue;}
        const axisBox=(m.shape||'box')==='box'&&(!m.r||m.r.every(x=>Math.abs(x)<1e-8));
        if(axisBox){let boxes=[e.bounds];for(const c of cuts)boxes=boxes.flatMap(p=>subtract(p,c));if(g.kind==='decor'&&m.s[1]>Math.max(m.s[0],m.s[2])*4)boxes=anchored(boxes,e.bounds.minY);for(const b of boxes){const mesh=meshBox(m,b,g.id);active.push({mesh,source:i,bounds:b,rotation:rotation(mesh.r)});}}
        else if(!cuts.some(c=>overlaps(e.bounds,c)))active.push(e);
      }
      const attached=record?.cuts.length&&g.colliders.length&&g.kind!=='roof'?active.filter(e=>e.solid||solids.some(q=>Math.hypot(Math.max(q.bounds.minX-e.bounds.maxX,0,e.bounds.minX-q.bounds.maxX),Math.max(q.bounds.minY-e.bounds.maxY,0,e.bounds.minY-q.bounds.maxY),Math.max(q.bounds.minZ-e.bounds.maxZ,0,e.bounds.minZ-q.bounds.maxZ))<.4)):active;
      if(deltaEnabled){const used=new Set();for(let i=0;i<attached.length;i++){const fresh=attached[i],old=g.active.find(e=>!used.has(e)&&e.source===fresh.source&&!!e.solid===!!fresh.solid&&(e.mesh===fresh.mesh||e.mesh.fragment&&fresh.mesh.fragment&&KEYS.every(k=>e.bounds[k]===fresh.bounds[k])));if(old){attached[i]=old;used.add(old);}}}
      return {active:attached,solids};
    }
    // Only touched groups need recompilation; their original order remains
    // significant when definitions share a render slot. Restores mark all groups.
    const geometryDirty=new Set(groups.values()),ownerIds=originalMeshes.map((_,i)=>meshOwner.get(i)),renderSlots=new Array(originalMeshes.length),firstIndex=new Uint32Array(originalMeshes.length),slotOffsets=new Float64Array(originalMeshes.length+1),claimed=new Set(definitions.flatMap(d=>d.colliders||[]));
    // A changed source only shifts the starts of later sources. Keep those
    // integer offsets in a Fenwick tree instead of revisiting every city mesh.
    // A complete restore resets the base starts and the tree together.
    function sourceStart(i){if(!Number.isInteger(i)||i<0||i>=firstIndex.length)return firstIndex[i];let n=i,offset=0;while(n>0){offset+=slotOffsets[n];n-=n&-n;}return firstIndex[i]+offset;}
    function shiftSources(i,amount){for(let n=i+1;n<slotOffsets.length;n+=n&-n)slotOffsets[n]+=amount;}
    function spliceMeshes(before,splices){
      if(!splices.length)return before.slice();
      const parts=[];let at=0;for(const q of splices){if(q.start>at)parts.push(before.slice(at,q.start));if(q.items.length)parts.push(q.items);at=q.start+q.deleteCount;}if(at<before.length)parts.push(before.slice(at));
      // Normal blasts have only a few ranges. Avoid argument-count limits for
      // exceptionally large generic FERRO worlds without changing their order.
      if(parts.length<4096)return [].concat(...parts);
      const result=[];for(const part of parts)for(const m of part)result.push(m);return result;
    }
    // Membership depends only on the fixed claimed indices and array length.
    // The records themselves remain live and are copied at each publication.
    let unclaimedIndices=[],unclaimedSourceLength=-1;
    function rebuild(next=states,full=false){
      previousToken=full?null:token;token=Object.freeze({});previousSnapshot=deltaEnabled?{meshes,colliders:collisionGeometry()}:null;lastDelta=emptyDelta=null;
      let output;const before=meshGeneration?meshes:null,changedSlots=new Map();full=full||!meshGeneration;
      for(const g of [...geometryDirty].sort((a,b)=>a.rebuildOrder-b.rebuildOrder)){
        const record=next.get(g.id),count=record?.cuts.length||0,removed=!!record?.removed;
        if(g.cacheRecord===record&&g.cacheCount===count&&g.cacheRemoved===removed)continue;
        // Damage already compiled this exact record for support checks and
        // debris. Reuse it; no caller can observe the interim render arrays.
        let built=g.pendingBuilt&&g.pendingRecord===record?g.pendingBuilt:null;
        if(!built){built=compile(g,record);geometryFor(g,built);}
        g.pendingBuilt=null;g.pendingRecord=null;g.cacheRecord=record;g.cacheCount=count;g.cacheRemoved=removed;
        for(const i of g.meshes){if(!full&&!changedSlots.has(i))changedSlots.set(i,renderSlots[i]||[]);renderSlots[i]=[];}
        for(const e of g.active)renderSlots[e.source].push(e);
      }
      geometryDirty.clear();
      // Splice starts refer to the previous flat array. Preserve occurrences
      // and source ordering, including zero-length slots and shared meshes.
      const splices=[],removed=[],added=[],offsetChanges=[];
      for(const [i,previous]of [...changedSlots].sort((a,b)=>a[0]-b[0])){
        if(!ownerIds[i])continue;const nextSlot=renderSlots[i]||[];
        if(previous.length===nextSlot.length&&previous.every((e,j)=>e.mesh===nextSlot[j].mesh))continue;
        const items=nextSlot.map(e=>e.mesh),start=sourceStart(i),last=splices[splices.length-1];
        if(last&&start===last.start+last.deleteCount){last.deleteCount+=previous.length;for(const m of items)last.items.push(m);}
        else splices.push({start,deleteCount:previous.length,items});
        for(const e of previous)removed.push(e.mesh);for(const m of items)added.push(m);
        if(nextSlot.length!==previous.length)offsetChanges.push([i,nextSlot.length-previous.length]);
      }
      // Preserve original mesh ordering, including coplanar decorative surfaces.
      // Only a changed original mesh is replaced by its local surviving pieces.
      if(full){
        output=[];slotOffsets.fill(0);
        for(let i=0;i<originalMeshes.length;i++){
          const id=ownerIds[i];firstIndex[i]=output.length;
          if(!id){output.push(originalMeshes[i]);continue;}
          for(const e of renderSlots[i]||[])output.push(e.mesh);
        }
      }else{
        output=spliceMeshes(before,splices);
        for(const [i,amount]of offsetChanges)shiftSources(i,amount);
      }
      // Snapshot unclaimed external records now, matching the eager API even
      // when a caller edits the original records before requesting colliders.
      if(unclaimedSourceLength!==originalColliders.length){unclaimedIndices=[];for(let i=0;i<originalColliders.length;i++)if(!claimed.has(i))unclaimedIndices.push(i);unclaimedSourceLength=originalColliders.length;}
      unclaimedBoxes=[];for(const i of unclaimedIndices){const c=originalColliders[i];unclaimedBoxes.push({...c,mesh:sourceStart(c.mesh)});}
      meshes=output;colliders=null;lights=(world.lights||[]).filter(l=>!next.get(String(l.destructibleId))?.removed);
      meshDelta={before,after:meshes,generation:++meshGeneration,full,splices,removed,added};
    }
    function collisionGeometry(){
      // Outdoor EMPRISE derives oriented world boxes from the visible meshes;
      // it never reads this optional FERRO collision array. Indoor callers and
      // other games still receive the exact ordered, revision-local snapshot.
      if(colliders)return colliders;
      const boxes=[];
      let index=0;for(let i=0;i<originalMeshes.length;i++){const id=ownerIds[i];if(!id){index++;continue;}for(const e of renderSlots[i]||[]){if(e.solid){const box=deltaEnabled?(e.collider||(e.collider={...e.solid.bounds,mesh:index,destructibleId:id})):{...e.solid.bounds,mesh:index,destructibleId:id};box.mesh=index;boxes.push(box);}index++;}}
      for(let i=0;i<unclaimedBoxes.length;i++){const box=unclaimedBoxes[i];if(!deltaEnabled){boxes.push(box);continue;}const old=stableUnclaimed.get(i);if(old&&KEYS.every(k=>old[k]===box[k])){old.mesh=box.mesh;boxes.push(old);}else{stableUnclaimed.set(i,box);boxes.push(box);}}
      return colliders=boxes;
    }
    function dirtyOf(removed,added,getBounds){
      if(!removed.length&&!added.length)return null;const out={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity};
      for(const item of [...removed,...added]){const q=getBounds(item);if(!q||!KEYS.every(k=>finite(q[k])))return null;for(const k of KEYS)out[k]=k.startsWith('min')?Math.min(out[k],q[k]):Math.max(out[k],q[k]);}return Object.freeze(out);
    }
    // Lazy multi-reader publication. EMPRISE's ordered splice API remains unchanged.
    function delta(since){
      if(!deltaEnabled){deltaEnabled=true;colliders=null;}
      const frozen=Object.freeze,empty=()=>frozen({added:frozen([]),removed:frozen([]),dirtyAABB:null});
      if(since===token)return emptyDelta||(emptyDelta=frozen({token,revision,full:false,...empty(),colliders:empty()}));
      const full=since!==previousToken||!previousSnapshot;
      if(!full&&lastDelta)return lastDelta;
      const changes=(old,fresh,getBounds)=>{const before=new Set(old),after=new Set(fresh),added=fresh.filter(x=>!before.has(x)),removed=old.filter(x=>!after.has(x));return frozen({added:frozen(added),removed:frozen(removed),dirtyAABB:dirtyOf(removed,added,getBounds)});};
      const result=frozen({token,revision,full,...(full?{added:frozen(meshes.slice()),removed:frozen([]),dirtyAABB:null}:changes(previousSnapshot.meshes,meshes,bounds)),colliders:full?frozen({added:frozen(collisionGeometry().slice()),removed:frozen([]),dirtyAABB:null}):changes(previousSnapshot.colliders,collisionGeometry(),q=>q)});
      if(!full)lastDelta=result;return result;
    }
    rebuild();seedSupports();
    function raycast(origin,direction,maxDistance=100){
      if(!validPoint(origin)||!validPoint(direction)||!finite(maxDistance)||maxDistance<=0)return null;
      const length=Math.hypot(...direction);if(length<EPS)return null;const dir=direction.map(v=>v/length),end=origin.map((v,i)=>v+dir[i]*Math.min(300,maxDistance));
      const candidates=query({minX:Math.min(origin[0],end[0]),maxX:Math.max(origin[0],end[0]),minZ:Math.min(origin[2],end[2]),maxZ:Math.max(origin[2],end[2])});
      let nearest=null,limit=Math.min(maxDistance,300);
      for(const g of candidates){if(!isAlive(g.id)||!rayBox(origin,dir,g.bounds,limit))continue;for(const e of g.active){const h=rayMesh(origin,dir,e,limit);if(h&&h.distance<limit){limit=h.distance;nearest={...h,id:g.id,point:origin.map((v,i)=>v+dir[i]*h.distance)};}}}
      return nearest;
    }
    const materialOf=m=>['metal','stone','wood','glass','dirt'].includes(m.material)?m.material:m.mat===3||m.mat===9?'stone':m.mat===10?'wood':m.mat===8||m.mat===11?'dirt':m.mat===12?'glass':'metal';
    function randomFor(seed){let n=(seed|0)||1;return ()=>{n=Math.imul(n^n>>>15,2246822519);n=Math.imul(n^n>>>13,3266489917);return ((n^n>>>16)>>>0)/4294967296;};}
    function chipsFor(g,e,point,power,out){
      const m=e.mesh,seed=e.source*977+revision*911+Math.round(power*13),random=randomFor(seed);
      for(let i=0;i<Math.min(3,Math.ceil(power/8)+1)&&out.length<12;i++){
        const span=.025+random()*.075,a=random()*Math.PI*2,speed=1+random()*2;
        out.push({x:point[0],y:point[1],z:point[2],size:[span,span*(.4+random()),span*(.6+random())],mat:m.mat||0,color:m.color?.slice(),material:materialOf(m),sourceId:g.id,velocity:[Math.cos(a)*speed,1+random()*2,Math.sin(a)*speed],life:.65+random()*.8,seed:seed+i});
      }
    }
    function removedGeometry(g,before,after,point,power,direction,out){
      // Diff the visible pieces, not the group's bounding box. A shot through a
      // fence must drop the severed rail and keep the other rail and posts.
      for(const e of before){
        const keep=after.filter(q=>q.source===e.source);
        if(keep.some(q=>q.mesh===e.mesh||KEYS.every(k=>Math.abs(q.bounds[k]-e.bounds[k])<EPS)))continue;
        const m=e.mesh,axisBox=(m.shape||'box')==='box'&&(!m.r||m.r.every(v=>Math.abs(v)<EPS));
        if(axisBox||e.solid&&keep.length){
          let lost=[e.bounds];for(const q of keep)lost=lost.flatMap(b=>subtract(b,q.bounds));
          for(const b of lost)out.push({mesh:meshBox(m,b,g.id),source:e.source,sourceId:g.id,kind:g.kind,point,power,direction});
        }else if(!keep.length)out.push({mesh:m,source:e.source,sourceId:g.id,kind:g.kind,point,power,direction});
      }
    }
    function sourceDebris(raw){
      const worth=q=>Math.pow(q.mesh.s.reduce((v,n)=>v*n,1),.35)*Math.max(...q.mesh.s),ordered=raw.sort((a,b)=>worth(b)-worth(a)),selected=[],seen=new Set();
      // Give each collapsed body a representative piece before spending the
      // remaining finite budget on detail. Small chips have a separate allowance.
      for(const q of ordered)if(!seen.has(q.sourceId)&&selected.length<MAX_DEBRIS-8){seen.add(q.sourceId);selected.push(q);}
      for(const q of ordered)if(selected.length<MAX_DEBRIS-8&&!selected.includes(q))selected.push(q);
      const splitAxis=q=>{if(!['box','bevel','cylinder'].includes(q.mesh.shape||'box'))return -1;const s=q.mesh.s;let axis=-1,ratio=1;for(let k=0;k<3;k++){if(q.mesh.shape==='cylinder'&&k!==1)continue;const target=q.kind==='roof'&&k===1&&s[1]<1.2?.35:2.4,r=s[k]/target;if(r>ratio){ratio=r;axis=k;}}return axis;};
      while(selected.length<MAX_DEBRIS-8){
        let at=-1,axis=-1,best=0;for(let i=0;i<selected.length;i++){const k=splitAxis(selected[i]);if(k>=0&&worth(selected[i])>best){at=i;axis=k;best=worth(selected[i]);}}
        if(at<0)break;const q=selected[at],m=q.mesh,s=m.s.slice(),a=rotation(m.r);s[axis]/=2;
        const pieces=[-1,1].map(sign=>({...q,mesh:{...m,s:s.slice(),p:m.p.map((v,k)=>v+sign*a[k*3+axis]*s[axis]/2)}}));selected.splice(at,1,...pieces);
      }
      return selected.map((q,i)=>{
        const m=q.mesh,seed=(q.source*977+(revision+1)*911+i*131)>>>0,random=randomFor(seed),material=materialOf(m),volume=m.s.reduce((v,n)=>v*n,1)*({sphere:Math.PI/6,cylinder:Math.PI/4,octa:1/6,ring:2*Math.PI*Math.PI*.435*.065*.065,foliage:.55}[m.shape]||1),mass=clamp(volume*({metal:65,stone:28,wood:8,glass:25,dirt:12}[material]),.035,160);
        const angle=random()*Math.PI*2,dx=m.p[0]-q.point[0],dz=m.p[2]-q.point[2],length=Math.hypot(dx,dz),speed=clamp(Math.sqrt(q.power)*.30/Math.pow(Math.max(1,mass),.22),.35,3.2),dir=q.direction||[length>.03?dx/length:Math.cos(angle),0,length>.03?dz/length:Math.sin(angle)],spin=Math.max(...m.s)>Math.min(...m.s)*8?.55:1.4;
        return {structural:true,sourceId:q.sourceId,shape:m.shape||'box',x:m.p[0],y:m.p[1],z:m.p[2],size:m.s.slice(),rotation:(m.r||[0,0,0]).slice(),angularVelocity:[(random()-.5)*spin,(random()-.5)*spin,(random()-.5)*spin],velocity:[dir[0]*speed,q.kind==='roof'?-.25:.35+random()*.9+dir[1]*speed,dir[2]*speed],resting:false,mat:m.mat||0,color:m.color?.slice(),material,mass,life:1e7,seed};
      });
    }
    function fallingDebris(raw){
      if(rules.fragmentation==='source')return sourceDebris(raw);
      const worth=q=>Math.pow(q.mesh.s.reduce((v,n)=>v*n,1),.35)*Math.max(...q.mesh.s),ordered=raw.slice().sort((a,b)=>worth(b)-worth(a)),selected=[],alloc=new Map(),seen=new Set(),capacity=MAX_DEBRIS-8;
      for(const q of ordered)if(!seen.has(q.sourceId)&&alloc.size<capacity){seen.add(q.sourceId);alloc.set(q,1);}
      for(const q of ordered)if(alloc.size<capacity&&!alloc.has(q))alloc.set(q,1);
      let used=alloc.size;while(used<capacity){let best=null,score=0;for(const [q,n] of alloc){const total=q.mesh.s.reduce((v,s)=>v*Math.max(1,Math.ceil(s/1.4)),1),value=worth(q)/(n+1);if(n<total&&value>score){best=q;score=value;}}if(!best)break;alloc.set(best,alloc.get(best)+1);used++;}
      let crumbleVolume=0,totalVolume=0;const center=[0,0,0];let radius=0;
      for(const q of ordered){const parts=fragment(q.mesh,alloc.get(q)||0);crumbleVolume+=parts.crumbleVolume;totalVolume+=parts.volume;for(let k=0;k<3;k++)center[k]+=q.mesh.p[k]*parts.volume;for(const part of parts.pieces)selected.push({...q,mesh:part.mesh,volume:part.volume});}
      if(totalVolume)for(let k=0;k<3;k++)center[k]/=totalVolume;
      for(const q of ordered)radius=Math.max(radius,Math.hypot(...q.mesh.p.map((v,k)=>v-center[k]))+Math.max(...q.mesh.s)/2);
      const debris=selected.map((q,i)=>{
        const m=q.mesh,seed=(q.source*977+(revision+1)*911+i*131)>>>0,random=randomFor(seed),material=materialOf(m),volume=q.volume,mass=clamp(volume*({metal:7800,stone:2200,wood:550,glass:2500,dirt:1500}[material]),.035,12000);
        const angle=random()*Math.PI*2,dx=m.p[0]-q.point[0],dz=m.p[2]-q.point[2],length=Math.hypot(dx,dz),speed=clamp(Math.sqrt(q.power)*.30/Math.pow(Math.max(1,mass),.22),.35,3.2),dir=q.direction||[length>.03?dx/length:Math.cos(angle),0,length>.03?dz/length:Math.sin(angle)],spin=Math.max(...m.s)>Math.min(...m.s)*8?.55:1.4;
        return {structural:true,sourceId:q.sourceId,shape:m.shape||'box',x:m.p[0],y:m.p[1],z:m.p[2],size:m.s.slice(),rotation:(m.r||[0,0,0]).slice(),angularVelocity:[(random()-.5)*spin,(random()-.5)*spin,(random()-.5)*spin],velocity:[dir[0]*speed,q.kind==='roof'?-.25:.35+random()*.9+dir[1]*speed,dir[2]*speed],resting:false,mat:m.mat||0,color:m.color?.slice(),material,mass,volume,life:1e7,seed};
      });
      if(crumbleVolume>EPS)debris.push({dust:true,structural:false,x:center[0],y:center[1],z:center[2],size:[clamp(radius*2,1,18),clamp(radius,1,7),clamp(radius*2,1,18)],volume:crumbleVolume,life:3.5,seed:revision+1});
      return debris;
    }
    function damage(point,radius,power,bullet,ignoreId,direction,source){
      const result={changed:false,revision,debris:[],events:[],pipeLeaks:[],collapsed:[]},fallen=[];
      if(!validPoint(point)||!finite(radius)||!finite(power)||radius<=0||power<=0)return result;
      radius=clamp(radius,.05,12);power=clamp(power,0,1000);
      const reach={minX:point[0]-radius,maxX:point[0]+radius,minY:point[1]-radius,maxY:point[1]+radius,minZ:point[2]-radius,maxZ:point[2]+radius};
      let targets=query(reach).filter(g=>g.id!==String(ignoreId)&&isAlive(g.id)&&g.active.some(e=>distance(point,e.bounds)<=radius));
      if(bullet)targets=targets.sort((a,b)=>Math.min(...a.active.map(e=>distance(point,e.bounds)))-Math.min(...b.active.map(e=>distance(point,e.bounds)))).slice(0,1);
      const touched=[];
      if(rules.canDamage)targets=targets.filter(g=>{if(rules.canDamage(g,bullet,source))return true;if(bullet){const near=g.active.reduce((a,c)=>distance(point,c.bounds)<distance(point,a.bounds)?c:a),box=near.bounds,normal=[0,0,0];let axis=0,side=1,best=Infinity;for(let k=0;k<3;k++)for(const sign of [-1,1]){const face=box[(sign<0?'min':'max')+'XYZ'[k]],gap=Math.abs(point[k]-face);if(gap<best){best=gap;axis=k;side=sign;}}normal[axis]=side;result.deflected=true;result.events.push({name:'materialImpact',deflected:true,sourceId:g.id,x:point[0],y:point[1],z:point[2],normal,material:materialOf(near.mesh),power:Math.min(2,power),seed:(world.seed+Math.imul(Math.round(point[0]*97)+Math.round(point[1]*193)+Math.round(point[2]*389),2654435761))>>>0});}return false;});
      for(const g of targets){
        const nearest=g.active.reduce((best,e)=>!best||distance(point,e.bounds)<distance(point,best.bounds)?e:best,null),d=distance(point,nearest.bounds),impact=[Math.max(nearest.bounds.minX,Math.min(point[0],nearest.bounds.maxX)),Math.max(nearest.bounds.minY,Math.min(point[1],nearest.bounds.maxY)),Math.max(nearest.bounds.minZ,Math.min(point[2],nearest.bounds.maxZ))],amount=power*(bullet?1:Math.pow(Math.max(0,1-d/radius),.45));if(amount<=.02)continue;
        const old=states.get(g.id)||{damage:0,cuts:[],removed:false},record={...old,cuts:old.cuts.slice(),damage:old.damage+amount},event={x:impact[0],y:impact[1],z:impact[2],sourceId:g.id,material:materialOf(nearest.mesh),power:amount,seed:nearest.source*977+(revision+1)*911};
        chipsFor(g,nearest,impact,amount,result.debris);
        if(record.damage<g.strength){states.set(g.id,record);geometryDirty.add(g);result.events.push({name:'materialImpact',...event});continue;}
        record.damage=0;
        const before=g.solids.reduce((v,q)=>v+volume(q.bounds),0),r=bullet?clamp(.30+Math.sqrt(power)*.13,.40,.85):radius*.66;
        const cut={minX:impact[0]-r,maxX:impact[0]+r,minY:impact[1]-r,maxY:impact[1]+r,minZ:impact[2]-r,maxZ:impact[2]+r};
        if(['tree','pipe'].includes(g.kind))record.removed=true;
        else record.cuts.push(cut);
        let built=compile(g,record);
        const remains=built.solids.reduce((v,q)=>v+volume(q.bounds),0);
        // Decorative groups can span a whole fence. Reaching their cut budget
        // must never erase unrelated posts/rails to save a handful of polygons.
        if(!g.colliders.length&&(record.cuts.length>MAX_CUTS||built.active.length>64)){states.set(g.id,{...old,damage:0});geometryDirty.add(g);result.events.push({name:'materialImpact',...event});continue;}
        if(built.solids.length>MAX_PARTS||record.cuts.length>MAX_CUTS||!built.active.length||g.colliders.length&&(!built.solids.length||remains<g.originalVolume*.035))record.removed=true;
        if(record.removed){record.cuts=[];built={active:[],solids:[]};result.collapsed.push(g.id);}
        // A grazing explosion must not create a fake revision or damage hole.
        if(record.removed||remains<before-EPS||built.active.length!==g.active.length||record.cuts.length){removedGeometry(g,g.active,built.active,impact,amount,direction,fallen);states.set(g.id,record);result.changed=true;touched.push(g.id);geometryFor(g,built);result.events.push({name:'materialBreak',...event});}
        for(const p of world.pipes||[])if(p.destructibleId===g.id&&!leaked.has(p.id)){leaked.add(p.id);result.pipeLeaks.push(p.id);}
      }
      if(result.changed){
        supportQueue=[...supportPending].sort((a,b)=>a-b);supportPending.clear();supportCursor=-1;for(const i of supportQueue)supportQueued[i]=1;
        while(supportQueue.length){const roof=nextSupported();if(isAlive(roof.id)&&(!rules.canDamage||rules.canDamage(roof,false,source))){
          if(supportFails(roof)){
            const point=[(roof.bounds.minX+roof.bounds.maxX)/2,roof.bounds.minY,(roof.bounds.minZ+roof.bounds.maxZ)/2];removedGeometry(roof,roof.active,[],point,45,undefined,fallen);
            states.set(roof.id,{damage:0,cuts:[],removed:true});geometryFor(roof,{active:[],solids:[]});result.collapsed.push(roof.id);
            for(const id of roof.dependents||[]){const g=groups.get(id);if(g&&isAlive(id)&&(!rules.canDamage||rules.canDamage(g,false,source))){removedGeometry(g,g.active,[],point,45,undefined,fallen);states.set(id,{damage:0,cuts:[],removed:true});geometryFor(g,{active:[],solids:[]});result.collapsed.push(id);}}
            result.events.push({name:'materialBreak',x:point[0],y:point[1],z:point[2],sourceId:roof.id,material:materialOf(entries[roof.meshes[0]].mesh),power:45,seed:roof.meshes[0]*977+(revision+1)*911});
          }
        }}supportQueue=null;supportCursor=-1;
        // Collapse only a locally over-fragmented body; never erase unrelated
        // scenery to meet a global budget or emit blocking cosmetic debris.
        let total=solidCount,limit=Math.max(512,originalColliders.length+384);
        for(const id of touched)if(total>limit){const g=groups.get(id);total-=g.solids.length;removedGeometry(g,g.active,[],point,power,direction,fallen);states.set(id,{damage:0,cuts:[],removed:true});geometryFor(g,{active:[],solids:[]});if(!result.collapsed.includes(id))result.collapsed.push(id);}
        result.debris=[...fallingDebris(fallen),...result.debris].slice(0,MAX_DEBRIS);
        rebuild();revision++;result.revision=revision;
      }
      return result;
    }
    function digestInto(mix){mix(signature);mix(revision);for(const [id,q] of states){mix(id);mix(q);}for(const id of leaked)mix(id);}
    function snapshot(){return {version:1,signature,revision,states:Array.from(states,([id,s])=>({id,damage:s.damage,removed:!!s.removed,cuts:s.cuts.map(copyBox)})),leaks:Array.from(leaked)};}
    function restore(value,options={}){
      if(!value||value.version!==1||value.signature!==signature||!Number.isInteger(value.revision)||value.revision<0||value.revision>1e9||!Array.isArray(value.states)||value.states.length>groups.size||!Array.isArray(value.leaks))return false;
      const next=new Map(),nextLeaks=new Set(),pipeIds=new Set((world.pipes||[]).map(p=>p.id));
      for(const s of value.states){
        if(!s||typeof s.id!=='string'||!groups.has(s.id)||next.has(s.id)||!finite(s.damage)||s.damage<0||s.damage>=groups.get(s.id).strength||typeof s.removed!=='boolean'||!Array.isArray(s.cuts)||s.cuts.length>MAX_CUTS||s.removed&&s.cuts.length)return false;
        const cuts=[];
        for(const b of s.cuts){if(!b||!KEYS.every(k=>finite(b[k]))||!(b.maxX>b.minX&&b.maxY>b.minY&&b.maxZ>b.minZ)||Math.max(b.maxX-b.minX,b.maxY-b.minY,b.maxZ-b.minZ)>24||!overlaps(b,groups.get(s.id).bounds))return false;cuts.push(copyBox(b));}
        const record={damage:s.damage,removed:s.removed,cuts},g=groups.get(s.id),built=compile(g,record);if(built.solids.length>MAX_PARTS||cuts.length&&!g.colliders.length&&built.active.length>64)return false;next.set(s.id,record);
      }
      for(const id of value.leaks){if(!pipeIds.has(id)||nextLeaks.has(id))return false;nextLeaks.add(id);}
      const total=Array.from(groups.values()).reduce((n,g)=>n+compile(g,next.get(g.id)).solids.length,0);
      if(total>Math.max(512,originalColliders.length+384))return false;
      // Validation finishes before any live array or state is replaced.
      states.clear();for(const [id,s] of next)states.set(id,s);leaked.clear();for(const id of nextLeaks)leaked.add(id);
      for(const g of groups.values())geometryDirty.add(g);
      rebuild(states,true);seedSupports();revision=options.exactRevision?value.revision:Math.max(revision+1,value.revision);return true;
    }
    return {delta,digestInto,detach(id){const g=groups.get(id);if(!g||!isAlive(id))return [];const out=g.active.map(e=>e.mesh);states.set(id,{damage:0,cuts:[],removed:true});geometryDirty.add(g);rebuild();revision++;return out;},describe(id){const g=groups.get(id);return g?{id:g.id,meshes:g.active.map(e=>e.mesh),strength:g.strength,bounds:g.bounds}:null;},sourceSpan(index){return Number.isInteger(index)&&index>=0&&index<originalMeshes.length?{start:sourceStart(index),length:ownerIds[index]?(renderSlots[index]?.length||0):1}:null;},get meshes(){return meshes;},get meshDelta(){return meshDelta;},get colliders(){return collisionGeometry();},get lights(){return lights;},get revision(){return revision;},isAlive,raycast,
      hit:(point,power,direction,source)=>damage(point,.22,power,true,undefined,validPoint(direction)?direction:undefined,source),blast:(point,radius,power,ignoreId,source)=>damage(point,radius,power,false,ignoreId,undefined,source),snapshot,restore};
  }
  G.FDestruction={create,fragment};
})(typeof window!=='undefined'?window:globalThis);
