/* FERRO — procedural destruction FX. Simulation owns every hazardous pose/time. */
(function(G){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),num=(v,f=0)=>Number.isFinite(v)?v:f;
  const hash=(seed,k=0)=>{let n=Math.imul((seed|0)^Math.imul(k+17,374761393),668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
  const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);},add=(p,d,k)=>p.map((x,i)=>x+d[i]*k);
  const orient=d=>[Math.acos(clamp(d[1],-1,1)),Math.atan2(d[0],d[2]),0];
  const debrisShapes=['box','bevel','cylinder','sphere','octa','ring','foliage'];
  function rotate(p,r){let [x,y,z]=p;const c=r.map(Math.cos),s=r.map(Math.sin);[y,z]=[c[0]*y-s[0]*z,s[0]*y+c[0]*z];[x,z]=[c[1]*x+s[1]*z,-s[1]*x+c[1]*z];return [c[2]*x-s[2]*y,s[2]*x+c[2]*y,z];}
  const mesh=(shape,p,s,mat=7,color,r=[0,0,0],part='')=>{const m=G.FRender.mesh(shape,p,s,mat,r,0);m.color=color;m.surface='object';m.effectPart=part;return m;};
  function build(state,world,camera,options={}){
    if(!state)return [];
    if(typeof options==='string')options={quality:options};
    const software=options.backend==='canvas2d',tier=options.quality==='low'?0:options.quality==='high'?2:1;
    const eye=camera?.pos||[state.player?.x||0,(state.player?.y||0)+1.62,state.player?.z||0],time=num(state.time),out=[];
    const budget=(software?[24,44,64]:[48,96,144])[tier],debrisBudget=(software?[8,18,28]:[18,38,60])[tier];let particles=0;
    const point=e=>[num(e.x),num(e.y),num(e.z)],distance=p=>Math.hypot(p[0]-eye[0],p[1]-eye[1],p[2]-eye[2]);
    const fade=(p,r=0)=>clamp(((software?42:105)-Math.max(0,distance(p)-r))/(software?18:40),0,1);
    const close=(list,limit=Infinity)=>Array.from(list||[]).filter(e=>[e.x,e.y,e.z].every(Number.isFinite)).sort((a,b)=>distance(point(a))-distance(point(b))).slice(0,limit);
    function puff(p,s,color,alpha,emissive=0,part='dust',shape='sphere',r=[0,0,0],mandatory=false){
      alpha*=fade(p,Math.hypot(...s)*.5);if(!mandatory&&particles>=budget||alpha<.008||s.some(v=>!(v>.002)))return;
      const m=mesh(shape,p,s,7,color,r,part);m.fx=true;m.alpha=clamp(alpha,0,.94);m.emissive=emissive;if(part==='blast-core'||part==='fire-cloud')m.fxFire=true;if(part==='blast-dust')m.fxSmoke=true;if(part==='blast-ember')m.fxSpark=true;if(mandatory)m.fxPriority='hazard';out.push(m);particles++;return m;
    }
    function solid(shape,p,s,mat,color,r,part){const m=mesh(shape,p,s,mat,color,r,part);out.push(m);return m;}

    // Telegraphs use the actual collision disc, annulus or swept capsule.
    // Large markers are kept while any part of their extent is in range.
    for(const a of state.bossAttacks||[]){
      if((!a.warning&&!a.active)||![a.x,a.y,a.z].every(Number.isFinite))continue;
      const p=[a.x,a.y+.026,a.z],warning=!!a.warning,color=warning?[1,.58,.08]:[1,.17,.035];
      const band=(radius,inner,part)=>{if(!(radius>.005)||radius<=inner)return;const m=puff(p,[radius*2,.022,radius*2],color,warning?.76:.68,warning?1.3:1.8,part,'ring',[0,0,0],true);if(m)m.innerRatio=clamp(inner/radius,0,.998);};
      if(a.kind==='ring'){
        const r=warning?num(a.radius):num(a.currentRadius),inner=warning?Math.max(0,r-.2):Math.max(0,num(a.innerRadius));if(!a.gaps)band(r,inner,'boss-ring');else{const thick=Math.max(.12,r-inner),mid=(r+inner)/2;for(let i=0;i<48;i++){const angle=i*Math.PI/24;if(Math.abs(Math.sin(angle-(a.angle+a.age*.25)))<Math.sin(.26+Math.PI/48))continue;const d=[Math.sin(angle),0,-Math.cos(angle)],q=add(p,d,mid);puff(q,[Math.max(.01,mid*Math.PI/24),.025,thick],color,warning?.76:.68,1.5,'boss-ring-segment','box',[0,Math.atan2(d[0],d[2]),0],true);}}
      }else if(a.kind==='sweep'){
        const d=unit([num(a.dx),0,num(a.dz,1)]),length=Math.max(0,num(a.length)),width=Math.max(.01,num(a.width)),yaw=Math.atan2(d[0],d[2]),center=add(p,d,length*.5);
        puff(center,[width*2,.022,Math.max(.01,length)],color,warning?.16:.28,1.0,'boss-sweep','box',[0,yaw,0],true);
        for(const k of [0,length])puff(add(p,d,k),[width*2,.022,width*2],color,warning?.16:.28,1.0,'boss-sweep-cap','cylinder',[0,0,0],true);
        for(const sign of [-1,1]){const side=[center[0]+d[2]*width*sign,center[1]+.002,center[2]-d[0]*width*sign];puff(side,[.045,.025,Math.max(.01,length)],color,.74,1.5,'boss-sweep-edge','box',[0,yaw,0],true);}
      }else if(a.kind==='slam'||a.kind==='rocketZone'){
        const radius=Math.max(0,num(a.radius));if(radius<=0)continue;
        if(a.burn&&a.active&&a.age-a.tell>(a.kind==='rocketZone'?.35:.22)){puff(p,[radius*2,.06,radius*2],[1,.28,.025],.3,1.8,'boss-burning-floor','cylinder',[0,0,0],true);for(let i=0;i<5;i++){const angle=i*1.2566+num(a.id),r=radius*.6;puff([p[0]+Math.sin(angle)*r,p[1]+.25+Math.sin(time*9+i)*.1,p[2]+Math.cos(angle)*r],[.25,.6,.25],[1,.45,.06],.5,2,'boss-burning-flame','octa',[0,0,0],true);}continue;}
        puff(p,[radius*2,.018,radius*2],color,warning?.09:.22,1.1,'boss-zone','cylinder',[0,0,0],true);band(radius,Math.max(0,radius-.14),'boss-zone-edge');
        if(warning){const remaining=clamp(1-num(a.age)/Math.max(.001,num(a.tell)),0,1);band(radius*remaining,Math.max(0,radius*remaining-.09),'boss-countdown');puff([p[0],p[1]+4,p[2]],[.4,8,.4],color,.35,1,'boss-column',a.kind==='slam'?'box':'cylinder',[0,0,0],true);}
        else puff([p[0],p[1]+.25,p[2]],[radius*2,.45,radius*2],color,.35*clamp(1-(num(a.age)-num(a.tell))/.35,0,1),1.6,'boss-zone-flash','cylinder',[0,0,0],true);
      }
    }

    // Moving hazards are never paid for from the cosmetic particle allowance.
    // Their dimensions/centres come directly from the collision box, including
    // a press or blade halted by contact with a player/enemy.
    for(const trap of state.traps||[]){
      if(trap.destroyed)continue;
      if(!trap.box){
        if(trap.kind==='spikes'&&trap.warning&&[trap.x,trap.y,trap.z].every(Number.isFinite)){
          const p=point(trap),w=Math.max(.2,num(trap.w,2)),d=Math.max(.2,num(trap.d,2));
          if(distance(p)<90)for(const sign of [-1,1]){
            const a=solid('box',[p[0]+sign*w*.46,p[1]+.018,p[2]],[.045,.025,d*.94],5,[1,.48,.08],[0,0,0],'spike-warning');
            const b=solid('box',[p[0],p[1]+.018,p[2]+sign*d*.46],[w*.94,.025,.045],5,[1,.48,.08],[0,0,0],'spike-warning');a.emissive=b.emissive=.55;
          }
        }
        continue;
      }
      const q=trap.box,lo=[q.minX,q.minY,q.minZ],hi=[q.maxX,q.maxY,q.maxZ];if(!lo.concat(hi).every(Number.isFinite))continue;
      const s=hi.map((v,k)=>v-lo[k]),p=lo.map((v,k)=>(v+hi[k])/2);if(s.some(v=>v<=0)||distance(p)>180+Math.hypot(...s))continue;
      const alert=trap.hot?[.76,.19,.045]:trap.warning?[.95,.55,.08]:[.25,.39,.37],near=distance(p)<(software?18:32),detail=near&&tier>0;
      if(trap.kind==='press'){
        solid(detail?'bevel':'box',p,s,0,[.24,.27,.27],[0,0,0],'press-body');
        const strips=detail?4:2;for(let i=0;i<strips;i++){
          const x=p[0]+s[0]*((i+.5)/strips-.5),z=p[2]+s[2]*.493;
          solid('box',[x,p[1]-s[1]*.22,z],[s[0]/strips*.42,s[1]*.24,Math.min(.015,s[2]*.01)],1,alert,[0,0,0],'press-stripe');
        }
      }else if(trap.kind==='spikes'){
        const nx=detail?3:2,nz=detail?3:2;
        for(let x=0;x<nx;x++)for(let z=0;z<nz;z++){
          const pos=[lo[0]+s[0]*(x+.5)/nx,p[1],lo[2]+s[2]*(z+.5)/nz];
          solid('octa',pos,[Math.min(.22,s[0]/nx*.72),s[1],Math.min(.22,s[2]/nz*.72)],3,[.55,.58,.56],[0,0,0],'spike');
        }
      }else if(trap.kind==='blade'){
        const axis=s.indexOf(Math.min(...s)),plane=[0,1,2].filter(k=>k!==axis),diameter=Math.min(s[plane[0]],s[plane[1]]),thickness=s[axis],normal=[0,0,0];normal[axis]=1;
        const r=orient(normal),angle=num(trap.angle);
        solid('cylinder',p,[diameter*.82,thickness*.92,diameter*.82],3,[.52,.56,.56],r,'blade-disc');
        solid('cylinder',p,[diameter*.22,thickness,diameter*.22],0,[.19,.24,.25],r,'blade-hub');
        const teeth=detail?12:8;
        for(let i=0;i<teeth;i++){
          const a=angle+i*Math.PI*2/teeth,pos=p.slice(),size=[diameter*.13,diameter*.13,diameter*.13];
          pos[plane[0]]+=Math.cos(a)*diameter*.43;pos[plane[1]]+=Math.sin(a)*diameter*.43;size[axis]=thickness*.88;
          solid('octa',pos,size,3,i%3? [.57,.59,.57]:alert,[0,0,0],'blade-tooth');
        }
      }
    }

    // A hot pipe's cloud stays inside its directed hazard volume. Warnings
    // show a nozzle glow; they never draw a damaging-looking full jet early.
    for(const pipe of close(state.pipes,software?4:8)){
      if(pipe.broken||!pipe.active||(!pipe.hot&&!pipe.warning))continue;
      const p=Array.isArray(pipe.nozzle)&&pipe.nozzle.length===3&&pipe.nozzle.every(Number.isFinite)?pipe.nozzle.slice():point(pipe),d=unit([num(pipe.dx,1),num(pipe.dy),num(pipe.dz)]),length=Math.max(.05,num(pipe.length,3)),radius=Math.max(.04,num(pipe.radius,.45)),r=orient(d),seed=num(pipe.id,1);
      if(fade(p)<=0)continue;
      const collar=solid('ring',p,[radius*.64,.035,radius*.64],pipe.hot?5:1,pipe.hot?[.85,.31,.08]:[.88,.55,.12],r,'pipe-warning');collar.emissive=pipe.hot?.25:.12;
      if(!pipe.hot)continue;
      const count=software?(tier?5:3):(tier===2?9:tier?7:4);
      for(let i=0;i<count;i++){
        const f=(time*1.8+i/count+hash(seed,i)*.13)%1,width=Math.min(radius*(.65+.9*f),length*.38),travel=width*.5+Math.max(0,length-width)*f;
        puff(add(p,d,travel),[width,width,width],[.68,.74,.74],(.32-.17*f)*(1-Math.abs(f-.5)*.3),.06,'steam');
      }
    }

    // Seconds, rather than normalized lifetime, keep the detonation sharp even
    // while its smoke survives. These deterministic cosmetics never deal damage.
    const blasts=close((state.explosions||[]).filter(e=>num(e.age)>=0&&num(e.age)<num(e.life,2.4)),software?6:12);
    for(let index=0;index<blasts.length;index++){
      const e=blasts[index],age=Math.max(0,num(e.age)),life=Math.max(.01,num(e.life,2.4)),t=age/life;
      const p=point(e),radius=Math.max(.1,num(e.radius,3)),seed=num(e.seed,num(e.id,1)),near=distance(p)<(software?20:48);
      // Share remaining cosmetics across simultaneous blasts; one fireball must
      // not consume every later explosion's flash and pressure front.
      const allowance=Math.max(0,Math.floor((budget-particles)/(blasts.length-index))),start=particles;
      const emit=(...args)=>particles-start<allowance?puff(...args):undefined;
      const expansion=radius*(.14+.72*(1-Math.exp(-age*9))),fireTime=Math.min(.86,life*.9),heat=clamp(1-age/fireTime,0,1);
      if(age<.14)emit(p,[expansion*1.28,expansion*1.28,expansion*1.28],[1,.91,.59],.94*(1-age/.14),4.8,'blast-core');
      if(age<.48){
        const wave=radius*(.1+1.24*Math.sqrt(age/.48)),strength=1-age/.48;
        const front=emit(p,[wave*2,.035+radius*.018,wave*2],[1,.67,.3],.65*strength,1.8*strength,'shock-ring','ring',orient(unit(eye.map((v,k)=>v-p[k]))));
        if(front)front.innerRatio=.92+.05*(1-strength);
        if(near&&tier>0)emit(p,[wave*2,wave*2,wave*2],[.78,.72,.61],.12*strength,.18,'pressure-shell');
      }
      const density=near?(software?tier+3:tier*2+4):2;
      if(heat>0)for(let i=0;i<density;i++){
        const a=hash(seed,i)*Math.PI*2,h=hash(seed,i+19),reach=expansion*(.18+hash(seed,i+31)*.36),center=[p[0]+Math.cos(a)*reach,p[1]+radius*age*(.4+h*.65),p[2]+Math.sin(a)*reach];
        const size=expansion*(.8+hash(seed,i+61)*.72),flicker=.88+.12*Math.sin(age*27+i*2.4),color=[1,.12+.43*heat,.018+.11*heat*heat];
        emit(center,[size,size*(1.02+h*.5),size],color,(.38+.2*heat)*Math.sqrt(heat)*flicker,1.5+heat*2.4,'fire-cloud','sphere',[age*.5,a,0]);
      }
      if(age>.12){
        const count=Math.max(2,density-1),smoke=clamp((age-.12)/.4,0,1)*Math.pow(1-t,.72);
        for(let i=0;i<count;i++){
          const a=hash(seed,i+91)*Math.PI*2,spread=radius*(.16+age*.22),center=[p[0]+Math.cos(a)*spread,p[1]+radius*(.1+age*(.32+hash(seed,i+111)*.13)),p[2]+Math.sin(a)*spread],size=radius*(.38+age*.38)*(1+hash(seed,i+131)*.35);
          emit(center,[size,size*(1.05+hash(seed,i+151)*.35),size],[.16+.08*heat,.145+.06*heat,.12+.025*heat],smoke*.32,heat*.16,'blast-dust');
        }
      }
      if(near&&age<1.05)for(let i=0;i<(software?3:5+tier*3);i++){
        const a=hash(seed,i+171)*Math.PI*2,speed=radius*(1.15+hash(seed,i+191)*1.1),up=radius*(.55+hash(seed,i+211)*1.2),velocity=[Math.cos(a)*speed,up-6*age,Math.sin(a)*speed];
        const tip=[p[0]+velocity[0]*age,p[1]+up*age-3*age*age,p[2]+velocity[2]*age],width=.018+radius*.006,trail=Math.max(width,Math.min(radius*.42,Math.hypot(...velocity)*.052)),direction=unit(velocity),center=add(tip,direction,-trail*.5),hot=1-age/1.05;
        emit(center,[width,trail,width],[1,.24+hot*.4,.025+hot*.14],.84*hot,1.9+hot*1.8,'blast-ember','octa',orient(direction));
      }
    }

    // Rocket and grenade solids stay within the actual projectile collision
    // sphere, including their tip/fins. Trails alone extend behind that body.
    const trails=[];
    for(const q of close(state.projectiles)){
      if(q.kind!=='rocket'&&q.kind!=='grenade')continue;
      const p=point(q),radius=Math.max(.02,num(q.radius,q.kind==='rocket'?.24:.17));if(distance(p)>180+radius)continue;
      const velocity=[num(q.vx),num(q.vy),num(q.vz)],speed=Math.hypot(...velocity),d=speed>.001?unit(velocity):[0,0,-1],r=orient(d),near=distance(p)<(software?22:48),tint=q.owner==='player'?[.12,.56,.54]:[.62,.24,.08];
      if(q.kind==='rocket'){
        solid('cylinder',p,[radius*.48,radius*1.3,radius*.48],0,[.23,.27,.25],r,'rocket-body');
        solid('octa',add(p,d,radius*.65),[radius*.5,radius*.5,radius*.5],3,[.57,.56,.44],r,'rocket-nose');
        if(near){const tail=add(p,d,-radius*.55);solid('box',tail,[radius*1.1,radius*.35,radius*.14],0,tint,r,'rocket-fin');solid('box',tail,[radius*.14,radius*.35,radius*1.1],0,tint,r,'rocket-fin');}
        trails.push({q,p,d,speed,radius});
      }else{
        const rotation=[num(q.age)*4.3,num(q.age)*2.2,num(q.age)*3.1];
        solid('sphere',p,[radius*1.7,radius*1.7,radius*1.7],7,[.24,.28,.17],rotation,'grenade-body');
        if(near){const cap=rotate([0,radius*.72,0],rotation).map((v,k)=>v+p[k]);const m=solid('box',cap,[radius*.55,radius*.24,radius*.55],5,tint,rotation,'grenade-fuse');m.emissive=.25+.35*(1-clamp(num(q.fuse,2)/2,0,1));}
        trails.push({q,p,d,speed,radius});
      }
    }
    for(const {q,p,d,speed,radius} of trails){
      if(q.kind==='rocket'){
        const tail=add(p,d,-radius*.9),length=Math.min(3.2,Math.max(0,num(q.age))*speed);
        puff(tail,[radius*.6,radius*.6,radius*.6],[1,.63,.12],.8,3,'rocket-jet');
        const count=software?(tier?3:1):(tier===2?6:4);
        for(let i=0;i<count;i++){const f=(i+1)/(count+1),size=radius*(.7+f*1.7);puff(add(tail,d,-length*f),[size,size,size],[.45,.43,.38],.28*(1-f),0,'rocket-smoke');}
      }else if(num(q.fuse,2)<.7)puff(p,[radius*2.1,radius*2.1,radius*2.1],[1,.38,.08],.12+.1*Math.sin(time*35),.7,'grenade-warning');
    }
    // Structural wreckage is real surviving geometry, not a short-lived
    // particle. Simulation alone owns its pose, settlement and retirement.
    // Filter before budgeting so expired chips cannot hide intact wreckage.
    const wreckage=[],yaw=num(camera?.yaw),pitch=num(camera?.pitch),heading=Number.isFinite(camera?.yaw)||Number.isFinite(camera?.pitch)?[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)]:null;
    const reach=software?42:105,bandSize=software?12:24;
    for(const q of state.debris||[]){
      if(!(Number.isFinite(q.x)&&Number.isFinite(q.y)&&Number.isFinite(q.z)))continue;
      const structural=q.structural===true,age=Math.max(0,num(q.age)),life=Math.max(.01,num(q.life,1.5));if(!structural&&age>=life)continue;
      const raw=Array.isArray(q.size)?q.size:[num(q.size,.12),num(q.size,.12),num(q.size,.12)];
      if(structural&&(raw.length!==3||raw.some(v=>!Number.isFinite(v)||v<=0)))continue;
      const shrink=structural?1:clamp((life-age)/(life*.24),0,1);
      const sx=structural?raw[0]:clamp(num(raw[0],.1),.015,3)*shrink,sy=structural?raw[1]:clamp(num(raw[1],.1),.015,3)*shrink,sz=structural?raw[2]:clamp(num(raw[2],.1),.015,3)*shrink;
      if(!structural&&(sx<.005||sy<.005||sz<.005))continue;
      const dx=q.x-eye[0],dy=q.y-eye[1],dz=q.z-eye[2],radius=Math.hypot(sx,sy,sz)*.5,d=Math.max(0,Math.hypot(dx,dy,dz)-radius);
      if(d>=reach)continue;
      const band=Math.floor(d/bandSize),rear=heading&&dx*heading[0]+dy*heading[1]+dz*heading[2]<-radius?1:0;
      wreckage.push({q,px:q.x,py:q.y,pz:q.z,sx,sy,sz,raw,structural,age,band,rear,score:d/(1+Math.min(radius,3)*.3),id:num(q.id,num(q.seed))});
    }
    // Un seul tri : structural décroissant, puis rear, band, score, id. La partition stable
    // par groupe (rear, band) remplace le second tri et le jeu de clés en chaînes : le premier
    // morceau de chaque sourceId garde sa place, les répétitions passent après, sans bouger.
    const order=(a,b)=>Number(b.structural)-Number(a.structural)||a.rear-b.rear||a.band-b.band||a.score-b.score||a.id-b.id;
    wreckage.sort(order);
    const kept=[];
    for(let i=0;i<wreckage.length&&kept.length<debrisBudget;){
      const head=wreckage[i];let j=i+1;
      while(j<wreckage.length&&wreckage[j].structural===head.structural&&wreckage[j].rear===head.rear&&wreckage[j].band===head.band)j++;
      const seen=head.structural?new Set():null,repeats=[];
      for(let k=i;k<j&&kept.length<debrisBudget;k++){const item=wreckage[k];
        if(seen&&typeof item.q.sourceId==='string'){if(seen.has(item.q.sourceId)){repeats.push(item);continue;}seen.add(item.q.sourceId);}
        kept.push(item);}
      for(let k=0;k<repeats.length&&kept.length<debrisBudget;k++)kept.push(repeats[k]);
      i=j;
    }
    for(const item of kept){
      const q=item.q,structural=item.structural;
      const supplied=Array.isArray(q.rotation)&&q.rotation.length===3&&q.rotation.every(Number.isFinite),seed=num(q.seed,1);
      const r=supplied?q.rotation.slice():structural?[0,0,0]:q.resting?[0,hash(seed,2)*Math.PI*2,0]:[item.age*(hash(seed,1)*5-2.5),item.age*(hash(seed,2)*5-2.5),item.age*(hash(seed,3)*5-2.5)];
      const p=[item.px,item.py,item.pz];
      if(!structural&&q.resting)p[1]-=(clamp(num(item.raw[1],.1),.015,3)-item.sy)*.5;
      const shape=structural&&debrisShapes.includes(q.shape)?q.shape:'box',color=Array.isArray(q.color)?q.color.slice():undefined,m=solid(shape,p,[item.sx,item.sy,item.sz],clamp(num(q.mat,3),0,12),color,r,'debris');
      if(structural){m.structural=true;m.debrisId=q.id;m.sourceId=q.sourceId;m.material=q.material;}
    }
    return out;
  }
  function flash(state,camera){
    const eye=camera?.pos||[0,0,0];let value=0;
    for(const e of state?.explosions||[]){const age=num(e.age);if(age<0||age>.18)continue;const distance=Math.hypot(num(e.x)-eye[0],num(e.y)-eye[1],num(e.z)-eye[2]);value=Math.max(value,Math.exp(-age*22)/(1+distance*distance*.045));}
    return Math.min(.85,value);
  }
  function lights(state){
    const p=state?.player||{},eye=[num(p.x),num(p.y)+1.62,num(p.z)],sources=[];
    for(const e of state?.explosions||[]){
      const age=num(e.age);if(age<0||age>=Math.min(1.05,num(e.life,2.4)))continue;
      const radius=Math.max(.1,num(e.radius,3)),heat=Math.exp(-age*5),power=clamp(radius*7+num(e.power)*.08,12,52)*heat;
      if(power<.25)continue;sources.push({p:[num(e.x),num(e.y),num(e.z)],color:[1,.31+.28*heat,.045+.09*heat],power,range:clamp(radius*3.2,6,35)});
    }
    for(const q of state?.projectiles||[])if(q.kind==='rocket'&&num(q.age)>=0&&num(q.life,1)>0){
      sources.push({p:[num(q.x),num(q.y),num(q.z)],color:[1,.28,.055],power:3.5+.5*Math.sin(num(q.age)*24),range:5.5});
    }
    // Discovery permanently wakes the pedestal. It uses persisted campaign
    // state, so reloads restore the light without replaying an audio event.
    // Cosmetic shrine lights share the fixed pool and yield to live combat.
    const campaign=state?.campaign,discovered=campaign?.discovered||[];
    for(const trophy of state?.world?.trophies||[]){
      if(![trophy.x,trophy.y,trophy.z].every(Number.isFinite))continue;
      const current=campaign?.trophies?.find(t=>t.id===trophy.id),phase=current?.phase;
      if(!(phase&&phase!=='sealed')&&!discovered.includes(trophy.key))continue;
      const grace=phase==='grace';
      sources.push({p:[trophy.x,trophy.y+2.1,trophy.z],color:grace?[.68,.89,1]:[.26,.66,.80],power:grace?10:3.2,range:grace?10:7,trophy:true});
    }
    const score=l=>l.power/(1+l.p.reduce((n,v,k)=>n+(v-eye[k])**2,0)*.06);
    return sources.filter(l=>l.p.every(Number.isFinite)&&l.p.reduce((n,v,k)=>n+(v-eye[k])**2,0)<(l.range+45)**2).sort((a,b)=>(!!a.trophy-!!b.trophy)||score(b)-score(a)).slice(0,4);
  }
  G.FEffects={build,flash,lights};
})(typeof window!=='undefined'?window:globalThis);
