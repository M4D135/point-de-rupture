/* FERRO — damped presentation. Aim and collision state are never modified here. */
(function(G){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
  function basis(yaw=0,pitch=0,roll=0){
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
    const r=[cy,0,sy],u=[-sy*sp,cp,cy*sp],b=[-sy*cp,-sp,cy*cp];
    return [r.map((v,k)=>v*cr+u[k]*sr),u.map((v,k)=>v*cr-r[k]*sr),b];
  }
  function rotation(x=0,y=0,z=0){
    const cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
    return [[cz*cy,sz*cy,-sy],[cz*sy*sx-sz*cx,sz*sy*sx+cz*cx,cy*sx],[cz*sy*cx+sz*sx,sz*sy*cx-cz*sx,cy*cx]];
  }
  // Trois sommes scalaires en littéral : même arithmétique et même ordre que le map d'origine,
  // sans allouer de tableau intermédiaire.
  const vector=(axes,v)=>[axes[0][0]*v[0]+axes[1][0]*v[1]+axes[2][0]*v[2],axes[0][1]*v[0]+axes[1][1]*v[1]+axes[2][1]*v[2],axes[0][2]*v[0]+axes[1][2]*v[1]+axes[2][2]*v[2]];
  const placementMemo=new WeakMap();
  function mount(camera,offset=[0,0,0],angles=[0,0,0]){
    const axes=basis(camera.yaw||0,camera.pitch||0,camera.roll||0),shift=vector(axes,offset),p=camera.pos,m=rotation(angles[0],angles[1],angles[2]);
    return {pos:[p[0]+shift[0],p[1]+shift[1],p[2]+shift[2]],axes:[vector(axes,m[0]),vector(axes,m[1]),vector(axes,m[2])]};
  }
  function place(frame,offset,rx=0){
    const a=frame.axes,shift=vector(a,offset);
    // The frame stays caller-owned (including frozen frames). Cache every basis
    // component used by the Euler decomposition, including mutations in place.
    let memo=placementMemo.get(frame);
    if(!memo){memo={valid:false,rx:0,a00:0,a01:0,a02:0,a11:0,a12:0,a21:0,a22:0,r0:0,ry:0,rz:0};placementMemo.set(frame,memo);}
    if(!memo.valid||!Object.is(memo.rx,rx)||!Object.is(memo.a00,a[0][0])||!Object.is(memo.a01,a[0][1])||!Object.is(memo.a02,a[0][2])
      ||!Object.is(memo.a11,a[1][1])||!Object.is(memo.a12,a[1][2])||!Object.is(memo.a21,a[2][1])||!Object.is(memo.a22,a[2][2])){
      const c=Math.cos(rx),s=Math.sin(rx),a1y=a[1][1]*c+a[2][1]*s,a1z=a[1][2]*c+a[2][2]*s,a2y=a[2][1]*c-a[1][1]*s,a2z=a[2][2]*c-a[1][2]*s;
      const ry=Math.asin(clamp(-a[0][2],-1,1)),regular=Math.abs(Math.cos(ry))>1e-6;
      memo.valid=true;memo.rx=rx;memo.a00=a[0][0];memo.a01=a[0][1];memo.a02=a[0][2];memo.a11=a[1][1];memo.a12=a[1][2];memo.a21=a[2][1];memo.a22=a[2][2];
      memo.ry=ry;memo.r0=regular?Math.atan2(a1z,a2z):Math.atan2(-a2y,a1y);
      memo.rz=regular?Math.atan2(a[0][1],a[0][0]):0;
    }
    const p=frame.pos;
    return {p:[p[0]+shift[0],p[1]+shift[1],p[2]+shift[2]],r:[memo.r0,memo.ry,memo.rz]};
  }
  function create(options={}){
    const recoil=Object.create(null);for(const [kind,value] of Object.entries(options?.recoil||{}))if(value&&typeof value==='object')recoil[kind]={omega:clamp(finite(value.omega),1,80),velocity:clamp(finite(value.velocity),0,20),pitch:clamp(finite(value.pitchDegrees),0,5)*Math.PI/180,fov:clamp(finite(value.fovDegrees),-5,5),roll:clamp(finite(value.rollDegrees),0,2)*Math.PI/180};
    let kickOmega=27,shotIndex=0,stepY=null,stepOffset=0;
    const springs={};
    const view={height:0,roll:0,fov:0,step:0,pitch:0,recoilFov:0,recoilRoll:0,weapon:{offset:[0,0,0],rotation:[0,0,0],slide:0}};
    function channel(key){return springs[key]||(springs[key]={x:0,v:0});}
    // Exact critically damped step for a constant target. Stable at any render cadence.
    function damp(key,target,omega,dt){
      const q=channel(key),x=q.x-target,e=Math.exp(-omega*dt),t=(q.v+omega*x)*dt;
      q.x=target+(x+t)*e;q.v=(q.v-omega*t)*e;return q.x;
    }
    function impulse(kind,amount=1){
      const response=recoil[kind];if(response){
        kickOmega=response.omega;channel('kick').v=Math.min(30,channel('kick').v+response.velocity);
        channel('cameraKick').v+=response.pitch*kickOmega*Math.E;
        channel('kickFov').v+=response.fov*14*Math.E;
        channel('kickRoll').v+=response.roll*kickOmega*Math.E*(shotIndex++%2?-1:1);return;
      }
      if(kind==='shot')channel('kick').v+=1.9;
      else if(kind==='pistol')channel('kick').v+=1.45;
      else if(kind==='fracture')channel('kick').v+=3.5;
      else if(kind==='rocket')channel('kick').v+=5.5;
      else if(kind==='blast')channel('blast').v=Math.min(3,channel('blast').v+clamp(finite(amount),0,1)*1.4);
      else if(kind==='land'&&options.cameraSteps)channel('landing').v-=Math.min(.08,Math.max(0,finite(amount))*.012)*18*Math.E;
      else if(kind==='switch')channel('equip').v-=2.5;
      else if(kind==='hurt')channel('impact').v+=.7;
      else if(kind==='pulse')channel('equip').v-=1.1;
      else if(kind==='melee')channel('melee').v=Math.max(channel('melee').v,5.8);
    }
    function reset(){
      for(const key of Object.keys(springs))delete springs[key];
      kickOmega=27;shotIndex=0;stepY=null;stepOffset=0;view.step=0;view.height=view.roll=view.fov=view.pitch=view.recoilFov=view.recoilRoll=0;view.weapon.offset.fill(0);view.weapon.rotation.fill(0);view.weapon.slide=0;
      return view;
    }
    function update(dt,loc={},signals={},enabled=true){
      dt=clamp(finite(dt),0,.12);
      const speed=Math.max(0,finite(loc.speed)),move=speed>.04?clamp(finite(loc.moveBlend),0,1):0;
      const run=clamp(finite(loc.sprintBlend),0,1),dash=clamp(finite(loc.dashBlend),0,1),phase=finite(loc.stridePhase);
      const strafe=clamp(finite(loc.strafe)/5,-1,1),forward=clamp(finite(loc.forward)/5,-1,1);
      const yawRate=clamp(finite(signals.lookYaw),-8,8),pitchRate=clamp(finite(signals.lookPitch),-6,6),time=finite(signals.time);
      const kick=damp('kick',0,kickOmega,dt),equip=damp('equip',0,21,dt),impact=damp('impact',0,23,dt),blast=damp('blast',0,17,dt),melee=damp('melee',0,19,dt);
      const intensity=enabled?1:.22,runPose=run*(signals.firing?.18:1);
      const breathing=Math.sin(time*1.45)*.002*(1-move);
      const x=damp('x',Math.sin(phase)*.014*move-strafe*.014-yawRate*.003,25,dt);
      const y=damp('y',Math.cos(phase*2)*.009*move-runPose*.024-dash*.028+breathing,25,dt);
      const z=damp('z',runPose*.012+dash*.032-forward*.004,23,dt);
      const pitch=damp('pitch',runPose*-.085-pitchRate*.008-clamp(finite(loc.accelForward),-20,20)*.0011,25,dt);
      const yaw=damp('yaw',-yawRate*.01-strafe*.013,25,dt);
      const roll=damp('weaponRoll',-strafe*.043-Math.sin(phase)*.014*move-yawRate*.003,25,dt);
      view.weapon.offset[0]=x*intensity-melee*.45;
      view.weapon.offset[1]=(y+equip-impact*.24)*intensity;
      view.weapon.offset[2]=z*intensity+kick*(enabled?1:.55)-melee*.9;
      view.weapon.rotation[0]=pitch*intensity+kick*.85;
      view.weapon.rotation[1]=yaw*intensity-melee*1.4;
      view.weapon.rotation[2]=roll*intensity+melee*2;
      const warmth=clamp((finite(signals.heat)-.75)/.25,0,1);if(warmth>0)view.weapon.rotation[0]+=Math.sin(time*61)*.005*warmth*intensity;
      view.weapon.slide=clamp(kick*1.1,0,.075);
      if(enabled){
        view.height=damp('height',Math.cos(phase*2)*.010*move-dash*.022,21,dt)+Math.sin(time*37)*blast*.06;
        view.roll=damp('cameraRoll',-strafe*.008+clamp(yawRate*.0007,-.004,.004),13,dt)+Math.sin(time*31)*blast*.025;
        view.fov=damp('fov',run*4.5+dash*5.5,12,dt);
      }else{
        view.height=view.roll=view.fov=0;
        for(const key of ['height','cameraRoll','fov']){const q=channel(key);q.x=q.v=0;}
      }
      if(options.cameraSteps){const y=Number.isFinite(signals.groundY)?signals.groundY:null,delta=stepY===null||y===null?0:y-stepY;stepOffset*=Math.exp(-14*dt);if(signals.grounded&&Math.abs(delta)<=.45)stepOffset-=delta;else if(!signals.grounded||Math.abs(delta)>.45)stepOffset=0;stepY=y;view.step=enabled?stepOffset:0;view.height+=view.step+damp('landing',0,18,dt)*(enabled?1:.3);}
      const recoilScale=enabled?1:.3;view.pitch=damp('cameraKick',0,kickOmega,dt)*recoilScale;view.recoilFov=damp('kickFov',0,14,dt)*recoilScale;view.recoilRoll=damp('kickRoll',0,kickOmega,dt)*recoilScale;view.fov+=view.recoilFov;view.roll+=view.recoilRoll;
      return view;
    }
    return {view,reset,update,impulse};
  }
  G.FMotion={create,basis,mount,place};
})(typeof window!=='undefined'?window:globalThis);
