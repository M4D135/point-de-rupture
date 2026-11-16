/* FERRO — collision geometry for new physical worlds. No DOM or rendering.
   Exact rectangular unions remove tiled seams; old snapshots retain the original geometry.
   Capsule sweeps use convex distance and conservative advancement, never time samples. */
(function(G){'use strict';
function merge(a,n){
  const alive=new Uint8Array(n).fill(1);let changed=true;
  while(changed){changed=false;for(let axis=0;axis<3;axis++){
    const groups=new Map(),u=(axis+1)%3,v=(axis+2)%3;
    for(let i=0;i<n;i++)if(alive[i]&&!a.O[i]){const b=i*6,key=a.F[i]+'|'+a.E[i]+'|'+a.M[i]+'|'+a.A[b+u]+'|'+a.A[b+u+3]+'|'+a.A[b+v]+'|'+a.A[b+v+3];let list=groups.get(key);if(!list)groups.set(key,list=[]);list.push(i);}
    for(const list of groups.values()){list.sort((i,j)=>a.A[i*6+axis]-a.A[j*6+axis]||i-j);let prev=list[0];for(let k=1;k<list.length;k++){const i=list[k],b=i*6,p=prev*6;if(a.A[b+axis]>a.A[p+axis+3]+1e-9){prev=i;continue;}a.A[p+axis+3]=Math.max(a.A[p+axis+3],a.A[b+axis+3]);a.P[prev*3+axis]=(a.A[p+axis]+a.A[p+axis+3])*.5;a.H[prev*3+axis]=(a.A[p+axis+3]-a.A[p+axis])*.5;alive[i]=0;changed=true;}}
  }}
  let count=0;for(const [key,width] of [['P',3],['H',3],['R',9],['A',6],['F',1],['E',1],['O',1],['M',1]]){count=0;for(let i=0;i<n;i++)if(alive[i]){if(i!==count)a[key].copyWithin(count*width,i*width,(i+1)*width);count++;}}return count;
}
function attach(w,d){
  const {P,H,HR,R,BB,SH,FL,GRP,GEN,V}=d,pa=new Float64Array(3),pb=new Float64Array(3),cuts=new Float64Array(8),a0=new Float64Array(3),a1=new Float64Array(3),b0=new Float64Array(3),b1=new Float64Array(3),closest=new Float64Array(7);
  let st=null,neighbors=[],identities=new Map();
  let faceHeads=new Int32Array(w.config.maxStatics*6),nextHeads=new Int32Array(w.config.maxStatics*6);
  const heads=new Int32Array(w.config.maxStatics*4),links=new Int32Array(w.config.maxStatics*2),oldToNew=new Int32Array(w.config.maxStatics),newToOld=new Int32Array(w.config.maxStatics);
  const roots=new Int32Array(FL.length),members=new Int32Array(FL.length),anchored=new Uint8Array(FL.length),speed=new Float64Array(FL.length);
  w.stats.governedSleep=0;w.stats.overBudget=0;
  function setStatics(a){
    const next=[],keys=new Map();nextHeads.fill(-1,0,a.count*6);oldToNew.fill(-1);newToOld.fill(-1);
    for(let i=0;i<a.count;i++)if(!a.O[i]){const b=i*6,key=a.A[b]+'|'+a.A[b+1]+'|'+a.A[b+2]+'|'+a.A[b+3]+'|'+a.A[b+4]+'|'+a.A[b+5];let list=keys.get(key);if(!list)keys.set(key,list=[]);const previous=identities.get(key),old=previous?.[list.length];list.push(i);if(old!==undefined){oldToNew[old]=i;newToOld[i]=old;}}
    const link=(face,neighbor)=>{next.push(neighbor,nextHeads[face]);nextHeads[face]=next.length-2;};
    // Remap unchanged faces and drop removed neighbours. Only newly shaped boxes
    // need geometric comparisons, including both sides of each new seam.
    if(st&&st.count){
      for(let i=0;i<a.count;i++){const old=newToOld[i];if(old<0)continue;for(let face=0;face<6;face++)for(let j=faceHeads[old*6+face];j>=0;j=neighbors[j+1]){const mapped=oldToNew[neighbors[j]];if(mapped>=0)link(i*6+face,mapped);}}
      for(let i=0;i<a.count;i++)if(!a.O[i]&&newToOld[i]<0)for(let j=0;j<a.count;j++)if(i!==j&&!a.O[j]&&(newToOld[j]>=0||j>i))for(let axis=0;axis<3;axis++){
        const b=i*6,c=j*6,u=(axis+1)%3,v=(axis+2)%3;
        if(Math.min(a.A[b+u+3],a.A[c+u+3])<=Math.max(a.A[b+u],a.A[c+u])+1e-9||Math.min(a.A[b+v+3],a.A[c+v+3])<=Math.max(a.A[b+v],a.A[c+v])+1e-9)continue;
        for(let side=0;side<2;side++){const left=a.A[b+axis+side*3],right=a.A[c+axis+(1-side)*3];if(Math.round(left*1e6)!==Math.round(right*1e6)||Math.abs(left-right)>1e-6)continue;link(i*6+axis*2+side,j);link(j*6+axis*2+1-side,i);}
      }
    }else for(let axis=0;axis<3;axis++){
      const planes=new Map(),u=(axis+1)%3,v=(axis+2)%3;let count=0;
      for(let i=0;i<a.count;i++)if(!a.O[i])for(let side=0;side<2;side++){const key=Math.round(a.A[i*6+axis+side*3]*1e6);let bucket=planes.get(key);if(bucket===undefined){bucket=count++;planes.set(key,bucket);heads[bucket*2]=heads[bucket*2+1]=-1;}links[i*2+side]=heads[bucket*2+side];heads[bucket*2+side]=i;}
      for(let bucket=0;bucket<count;bucket++)for(let i=heads[bucket*2];i>=0;i=links[i*2])for(let j=heads[bucket*2+1];j>=0;j=links[j*2+1]){
        if(i===j)continue;const b=i*6,c=j*6;if(Math.abs(a.A[b+axis]-a.A[c+axis+3])>1e-6||Math.min(a.A[b+u+3],a.A[c+u+3])<=Math.max(a.A[b+u],a.A[c+u])+1e-9||Math.min(a.A[b+v+3],a.A[c+v+3])<=Math.max(a.A[b+v],a.A[c+v])+1e-9)continue;
        link(i*6+axis*2,j);link(j*6+axis*2+1,i);
      }
    }
    let masked=0;for(let i=0;i<a.count*6;i++)if(nextHeads[i]>=0)masked++;const previousHeads=faceHeads;faceHeads=nextHeads;nextHeads=previousHeads;st=a;neighbors=next;identities=keys;w.stats.internalFaces=masked;return masked;
  }
  function filter(index,n,N,P,S,I){let count=0;for(let k=0;k<n;k++){const p=k*3;let internal=false;for(let axis=0;axis<3;axis++){if(Math.abs(N[p+axis])<.999)continue;const side=N[p+axis]>0?0:1,head=faceHeads[index*6+axis*2+side];if(head<0)break;const u=(axis+1)%3,v=(axis+2)%3,plane=st.A[index*6+axis+side*3];if(S[k]<0&&Math.abs(P[p+axis]-plane)>.03)break;for(let j=head;j>=0;j=neighbors[j+1]){const b=neighbors[j]*6;if(P[p+u]>=st.A[b+u]-.006&&P[p+u]<=st.A[b+u+3]+.006&&P[p+v]>=st.A[b+v]-.006&&P[p+v]<=st.A[b+v+3]+.006){internal=true;break;}}break;}if(!internal){for(let j=0;j<3;j++){N[count*3+j]=N[p+j];P[count*3+j]=P[p+j];}S[count]=S[k];I[count]=I[k];count++;}}return count;}
  // Only slow, supported contact islands may be sacrificed to the awake budget.
  // An airborne body is never frozen; overBudget reports an unavoidable excess.
  function govern(AL,ACT,UF,na,cA,cB,cN,cS,nc,limit){
    let awake=0;for(let i=1;i<d.count();i++)if((FL[i]&31)===1)awake++;if(awake<=limit){w.stats.overBudget=0;return 0;}
    members.fill(0);anchored.fill(0);speed.fill(0);for(let k=0;k<na;k++){const i=AL[k];if(ACT[i]!==1||FL[i]&2)continue;let root=i;while(UF[root]!==root)root=UF[root];roots[i]=root;members[root]++;const v=i*6,energy=V[v]*V[v]+V[v+1]*V[v+1]+V[v+2]*V[v+2]+.25*(V[v+3]*V[v+3]+V[v+4]*V[v+4]+V[v+5]*V[v+5]);speed[root]=Math.max(speed[root],energy);}
    for(let k=0;k<nc;k++)if(cS[k]<=.005){const a=cA[k],b=cB[k],ny=cN[k*3+1];if(ACT[a]===1&&!(FL[a]&2)&&(!b||FL[b]&6)&&ny<-.5)anchored[roots[a]]=1;if(b&&ACT[b]===1&&!(FL[b]&2)&&(FL[a]&6)&&ny>.5)anchored[roots[b]]=1;}
    let slept=0;while(awake>limit){let best=0,value=Infinity;for(let i=1;i<d.count();i++)if(members[i]&&anchored[i]&&speed[i]<.04&&speed[i]<value){best=i;value=speed[i];}if(!best)break;for(let k=0;k<na;k++){const i=AL[k];if(ACT[i]===1&&!(FL[i]&2)&&roots[i]===best){FL[i]|=2;V.fill(0,i*6,i*6+6);slept++;awake--;}}members[best]=0;}
    w.stats.governedSleep+=slept;w.stats.overBudget=Math.max(0,awake-limit);return slept;
  }
  const validVector=v=>v&&v.length===3&&Number.isFinite(v[0])&&Number.isFinite(v[1])&&Number.isFinite(v[2]);
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  function boxDistance(x,y,z,radius,height,cp,ch,cr,i){
    const p=i*3,rot=i*9,dx=x-cp[p],dy=y+radius-cp[p+1],dz=z-cp[p+2],length=height-2*radius;
    for(let k=0;k<3;k++){pa[k]=dx*cr[rot+k]+dy*cr[rot+3+k]+dz*cr[rot+6+k];pb[k]=cr[rot+3+k]*length;}
    let nc=2;cuts[0]=0;cuts[1]=1;for(let k=0;k<3;k++)if(Math.abs(pb[k])>1e-14)for(let sign=-1;sign<=1;sign+=2){const t=(sign*ch[p+k]-pa[k])/pb[k];if(t>0&&t<1)cuts[nc++]=t;}
    for(let i=1;i<nc;i++){const t=cuts[i];let j=i;while(j&&cuts[j-1]>t){cuts[j]=cuts[j-1];j--;}cuts[j]=t;}
    let best=Infinity,bt=0;
    for(let j=0;j<nc-1;j++){const lo=cuts[j],hi=cuts[j+1],mid=(lo+hi)*.5;let aa=0,ab=0;for(let k=0;k<3;k++){const q=pa[k]+pb[k]*mid,h=ch[p+k];if(q>h||q<-h){const c=pa[k]-(q>h?h:-h);aa+=pb[k]*pb[k];ab+=pb[k]*c;}}const t=aa?Math.max(lo,Math.min(hi,-ab/aa)):lo;let ds=0;for(let k=0;k<3;k++){const q=pa[k]+pb[k]*t,h=ch[p+k],v=q>h?q-h:q<-h?q+h:0;ds+=v*v;}if(ds<best){best=ds;bt=t;}}
    let sep;for(let k=0;k<3;k++){a0[k]=pa[k]+pb[k]*bt;b0[k]=Math.max(-ch[p+k],Math.min(ch[p+k],a0[k]));a1[k]=a0[k]-b0[k];}
    if(best>1e-20){const len=Math.sqrt(best);for(let k=0;k<3;k++)a1[k]/=len;sep=len-radius;}else{let depth=Infinity,axis=1,sign=1;for(let k=0;k<3;k++){const lo=Math.min(pa[k],pa[k]+pb[k]),hi=Math.max(pa[k],pa[k]+pb[k]),up=ch[p+k]+radius-lo,down=ch[p+k]+radius+hi;if(up<depth){depth=up;axis=k;sign=1;}if(down<depth){depth=down;axis=k;sign=-1;}}a1.fill(0);a1[axis]=sign;b0[axis]=sign*ch[p+axis];sep=-depth;}
    closest[0]=sep;for(let k=0;k<3;k++){closest[1+k]=cr[rot+3*k]*a1[0]+cr[rot+3*k+1]*a1[1]+cr[rot+3*k+2]*a1[2];closest[4+k]=cp[p+k]+cr[rot+3*k]*b0[0]+cr[rot+3*k+1]*b0[1]+cr[rot+3*k+2]*b0[2];}
  }
  function roundDistance(x,y,z,radius,height,i){
    const p=i*3,t=i*9,extent=HR[p+1]-HR[p],other=H[p];a0[0]=x;a0[1]=y+radius;a0[2]=z;a1[0]=0;a1[1]=height-2*radius;a1[2]=0;
    for(let k=0;k<3;k++){b0[k]=P[p+k]-R[t+3*k+1]*extent;b1[k]=2*R[t+3*k+1]*extent;pa[k]=a0[k]-b0[k];}
    const aa=dot(a1,a1),bb=dot(b1,b1),ab=dot(a1,b1),ar=dot(a1,pa),br=dot(b1,pa),den=aa*bb-ab*ab;let s=aa>1e-16?(den>1e-16?Math.max(0,Math.min(1,(ab*br-bb*ar)/den)):0):0,t0=bb>1e-16?(ab*s+br)/bb:0;
    if(t0<0){t0=0;s=aa>1e-16?Math.max(0,Math.min(1,-ar/aa)):0;}else if(t0>1){t0=1;s=aa>1e-16?Math.max(0,Math.min(1,(ab-ar)/aa)):0;}else if(bb<1e-16)s=aa>1e-16?Math.max(0,Math.min(1,-ar/aa)):0;
    let ds=0;for(let k=0;k<3;k++){pb[k]=b0[k]+b1[k]*t0;pa[k]=a0[k]+a1[k]*s-pb[k];ds+=pa[k]*pa[k];}const len=Math.sqrt(ds);closest[0]=len-radius-other;for(let k=0;k<3;k++){const normal=len>1e-12?pa[k]/len:k===1?1:0;closest[1+k]=normal;closest[4+k]=pb[k]+normal*other;}
  }
  function sweepCapsule(pos,delta,options={},out={}){
    const radius=options.radius??.28,height=options.height??1.8,mask=options.mask??65535,ignore=options.ignore??0,skin=options.skin??.001;
    if(!validVector(pos)||!validVector(delta)||!Number.isFinite(radius)||radius<=0||!Number.isFinite(height)||height<2*radius||!Number.isFinite(skin)||skin<0)throw TypeError('FPhysics.sweepCapsule: finite capsule and displacement required');
    out.hit=false;out.fraction=1;out.handle=0;out.staticIndex=-1;out.depth=0;out.nx=out.ny=out.nz=0;
    const x0=Math.min(pos[0],pos[0]+delta[0])-radius-skin,x1=Math.max(pos[0],pos[0]+delta[0])+radius+skin,y0=Math.min(pos[1],pos[1]+delta[1])-skin,y1=Math.max(pos[1],pos[1]+delta[1])+height+skin,z0=Math.min(pos[2],pos[2]+delta[2])-radius-skin,z1=Math.max(pos[2],pos[2]+delta[2])+radius+skin;
    const ns=options.statics===false||!(mask&1)?0:st?.count||0,nb=d.count();
    for(let j=0;j<ns+nb-1;j++){
      const isStatic=j<ns,i=isStatic?j:j-ns+1,handle=isStatic?0:GEN[i]*4096+i;
      if(!isStatic&&((FL[i]&(1|8|16))!==1||!(GRP[i]&mask)||handle===ignore))continue;
      const bounds=isStatic?st.A:BB,b=i*6;if(bounds[b]>x1||bounds[b+3]<x0||bounds[b+1]>y1||bounds[b+4]<y0||bounds[b+2]>z1||bounds[b+5]<z0)continue;
      let t=0;for(let it=0;it<24;it++){
        const x=pos[0]+delta[0]*t,y=pos[1]+delta[1]*t,z=pos[2]+delta[2]*t;if(isStatic)boxDistance(x,y,z,radius,height,st.P,st.H,st.R,i);else if(SH[i])roundDistance(x,y,z,radius,height,i);else boxDistance(x,y,z,radius,height,P,H,R,i);
        const sep=closest[0],closing=-(delta[0]*closest[1]+delta[1]*closest[2]+delta[2]*closest[3]);
        if(t===0&&sep<skin&&options.ignoreInitial)break;
        if(t===0&&sep< -1e-6&&options.allowExit&&closing<=1e-10)break;
        if(sep<=skin+1e-7){if(t===0&&sep>=-1e-6&&closing<=1e-10)break;if(t<=out.fraction){out.hit=true;out.fraction=t;out.handle=handle;out.staticIndex=isStatic?i:-1;out.depth=Math.max(0,-sep);out.nx=closest[1];out.ny=closest[2];out.nz=closest[3];out.x=closest[4];out.y=closest[5];out.z=closest[6];}break;}
        if(closing<=1e-12)break;t+=(sep-skin)/closing;if(t>out.fraction||t>1)break;
      }
    }return out;
  }
  function character(options={}){
    const opt={radius:options.radius??.28,height:options.height??1.8,skin:options.skin??.002,mask:options.mask??65535,ignore:options.ignore??0,statics:options.statics!==false},step=options.step??.42,slope=options.slope??.7;
    if(!Number.isFinite(step)||step<0||!Number.isFinite(slope)||slope<0||slope>1)throw TypeError('FPhysics.character: invalid step or slope');
    const p=new Float64Array(3),v=new Float64Array(3),up=new Float64Array(3),candidate=new Float64Array(3),h={},landing={},support={};
    function move(pos,delta,out={}){
      if(!validVector(pos)||!validVector(delta))throw TypeError('FPhysics.character.move: finite vectors required');p.set(pos);v.set(delta);out.grounded=false;out.handle=0;out.nx=out.ny=out.nz=0;
      for(let pass=0;pass<4;pass++){
        sweepCapsule(p,v,opt,h);if(!h.hit){for(let k=0;k<3;k++)p[k]+=v[k];break;}
        if(h.depth>1e-6){const lift=Math.min(.5,h.depth+opt.skin);p[0]+=h.nx*lift;p[1]+=h.ny*lift;p[2]+=h.nz*lift;continue;}
        if(step>0&&h.ny<slope&&(v[0]*v[0]+v[2]*v[2])>1e-12&&delta[1]<=.001){
          up[0]=0;up[1]=-.06;up[2]=0;sweepCapsule(p,up,opt,support);
          if(support.hit&&support.ny>=slope){up[1]=step;sweepCapsule(p,up,opt,landing);if(!landing.hit){candidate.set(p);candidate[1]+=step;up[0]=v[0];up[1]=0;up[2]=v[2];sweepCapsule(candidate,up,opt,landing);if(!landing.hit){candidate[0]+=v[0];candidate[2]+=v[2];up[0]=0;up[1]=-step-.06;up[2]=0;sweepCapsule(candidate,up,opt,landing);if(landing.hit&&landing.ny>=slope){candidate[1]+=up[1]*landing.fraction;p.set(candidate);out.grounded=true;out.handle=landing.handle;out.nx=landing.nx;out.ny=landing.ny;out.nz=landing.nz;break;}}}}
        }
        for(let k=0;k<3;k++){p[k]+=v[k]*h.fraction;v[k]*=1-h.fraction;}const normal=v[0]*h.nx+v[1]*h.ny+v[2]*h.nz;if(normal<0){v[0]-=h.nx*normal;v[1]-=h.ny*normal;v[2]-=h.nz*normal;}out.nx=h.nx;out.ny=h.ny;out.nz=h.nz;if(h.ny>=slope){out.grounded=true;out.handle=h.handle;}if(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]<1e-16)break;
      }
      if(delta[1]<=.001&&!out.grounded){up[0]=0;up[1]=-.06;up[2]=0;sweepCapsule(p,up,opt,h);if(h.hit&&h.ny>=slope){p[1]+=up[1]*h.fraction;out.grounded=true;out.handle=h.handle;out.nx=h.nx;out.ny=h.ny;out.nz=h.nz;}}
      out.x=p[0];out.y=p[1];out.z=p[2];out.vx=out.vy=out.vz=0;if(out.handle){const i=out.handle&4095;out.vx=V[i*6];out.vy=V[i*6+1];out.vz=V[i*6+2];}return out;
    }return {move};
  }
  w.sweepCapsule=sweepCapsule;w.character=character;return {setStatics,filter,govern};
}
G.FPhysicsGeometry={merge,attach};
})(typeof window!=='undefined'?window:globalThis);
