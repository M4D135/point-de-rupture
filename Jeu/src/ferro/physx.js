/* FERRO PhysX 5.12.0 — rigid bodies, CCD, sweeps. Requires physx-runtime.js pre-loaded.
   Offline CPU backend. Fixed steps retain their fractional remainder; backlog
   beyond maxSubSteps is dropped. No cross-platform bitwise determinism guarantee. */
(function(G){'use strict';
var P=null,_foundation=null,_initP=null,_ready=false,_ver='0.0.0',_worlds=new Set(),_qc=0,_allocator=null,_errors=null,_physics=null;

async function init(){
  if(_initP)return _initP;
  _initP=(async()=>{
    if(!G.FPhysXFactory)throw new Error('FPhysX: runtime absent');
    P=await G.FPhysXFactory({wasmBinary:G.FPhysXFactory.decodeWasm()});
    var v=P.PHYSICS_VERSION;
    _ver=((v>>24)&0xff)+'.'+((v>>16)&0xff)+'.'+((v>>8)&0xff);
    _allocator=new P.PxDefaultAllocator();_errors=new P.PxDefaultErrorCallback();_foundation=P.CreateFoundation(v,_allocator,_errors);
    const scale=new P.PxTolerancesScale();_physics=P.CreatePhysics(v,_foundation,scale);P.destroy(scale);
    _ready=true;return P;
  })();return _initP;
}
function isReady(){return _ready}
function status(){return{ready:_ready,version:_ver,worlds:_worlds.size,queryCount:_qc}}

function _v3(x,y,z){return new P.PxVec3(x||0,y||0,z||0)}
function _q(x,y,z,w){return x===undefined?new P.PxQuat(P.PxIDENTITYEnum.PxIdentity):new P.PxQuat(x,y,z,w)}
function _pose(px,py,pz,qx,qy,qz,qw){
  var p=_v3(px,py,pz),q=qx===undefined?_q():_q(qx,qy,qz,qw);
  var t=new P.PxTransform(p,q);P.destroy(p);P.destroy(q);return t;
}
function _rotZ(rad){
  var ax=_v3(0,0,1),q=new P.PxQuat(rad,ax);P.destroy(ax);
  var p=_v3(0,0,0),t=new P.PxTransform(p,q);P.destroy(p);P.destroy(q);return t;
}
function _vf(a,n,size=3){if(!Array.isArray(a)||a.length!==size)throw new TypeError(n+' array');for(var i=0;i<a.length;i++)if(!Number.isFinite(a[i]))throw new RangeError(n+'['+i+']');}

function _alive(w){if(w._disposed)throw new Error('FPhysX: disposed world');}
function _options(o={}){
  if(!['static','dynamic','kinematic'].includes(o.type??'dynamic'))throw new TypeError('body type');
  for(const [key,value,min,max] of [['mass',o.mass??1,Number.MIN_VALUE,Infinity],['friction',o.friction??.6,0,Infinity],['restitution',o.restitution??0,0,1]])if(!Number.isFinite(value)||value<min||value>max)throw new RangeError(key);
  for(const key of ['group','mask'])if(o[key]!==undefined&&(!Number.isInteger(o[key])||o[key]<0||o[key]>0xFFFFFFFF))throw new RangeError(key);
  if(o.ccd&&o.type==='kinematic')throw new TypeError('CCD is for dynamic bodies; sweep kinematic targets');
  return o;
}
function _box(ob){
  if(!ob)throw new TypeError('box');
  const center=ob.center??[(ob.minX+ob.maxX)/2,(ob.minY+ob.maxY)/2,(ob.minZ+ob.maxZ)/2],half=ob.half??[(ob.maxX-ob.minX)/2,(ob.maxY-ob.minY)/2,(ob.maxZ-ob.minZ)/2];
  _vf(center,'center');_vf(half,'half');if(half.some(v=>v<=0))throw new RangeError('half>0');return {center,half};
}
function dispose(){
  if(_worlds.size)throw new Error('FPhysX: dispose worlds first');
  if(!_ready)return;
  _physics.release();_foundation.release();P.destroy(_allocator);P.destroy(_errors);
  _physics=_foundation=_allocator=_errors=P=null;_ready=false;_initP=null;
}

function _shader(){
  var s=new P.PassThroughFilterShaderImpl();
  s.filterShader=function(a0,w0,w1,w2,w3,a1,u0,u1,u2,u3){
    s.set_outputPairFlags(P.PxPairFlagEnum.eCONTACT_DEFAULT|P.PxPairFlagEnum.eDETECT_CCD_CONTACT);
    if(!(w0&u1)||!(u0&w1))return P.PxFilterFlagEnum.eKILL;
    return P.PxFilterFlagEnum.eDEFAULT;
  };
  s.set_outputPairFlags(P.PxPairFlagEnum.eCONTACT_DEFAULT|P.PxPairFlagEnum.eDETECT_CCD_CONTACT);
  return s;
}

function _addBody(w,pos,geom,o){
  var type=o.type??'dynamic',mass=o.mass??1,fr=o.friction??0.6,re=o.restitution??0;
  var ccd=!!o.ccd,grp=o.group??0xFFFFFFFF,msk=o.mask??0xFFFFFFFF;
  if(!Number.isFinite(mass)||mass<=0)throw new RangeError('mass>0');
  if(!Number.isFinite(fr)||fr<0)throw new RangeError('friction>=0');
  if(!Number.isFinite(re)||re<0||re>1)throw new RangeError('restitution 0..1');
  var mat=w._physics.createMaterial(fr,fr,re);
  var sf=new P.PxShapeFlags(P.PxShapeFlagEnum.eSIMULATION_SHAPE|P.PxShapeFlagEnum.eSCENE_QUERY_SHAPE);
  var shape=w._physics.createShape(geom,mat,true,sf);
  P.destroy(sf);P.destroy(geom);mat.release();
  var fd=new P.PxFilterData(grp,msk,0,0);shape.setSimulationFilterData(fd);P.destroy(fd);
  var pose=_pose(pos[0],pos[1],pos[2]),actor;
  if(type==='static'){actor=w._physics.createRigidStatic(pose);}
  else{actor=w._physics.createRigidDynamic(pose);
    if(type==='kinematic')actor.setRigidBodyFlag(P.PxRigidBodyFlagEnum.eKINEMATIC,true);
    if(ccd)actor.setRigidBodyFlag(P.PxRigidBodyFlagEnum.eENABLE_CCD,true);
  }
  P.destroy(pose);actor.attachShape(shape);
  if(type==='dynamic')P.PxRigidBodyExt.prototype.setMassAndUpdateInertia(actor,mass);
  w._scene.addActor(actor);
  var id=w._nextId++;w._bodies.set(id,{actor:actor,shape:shape,type:type});return id;
}

function createWorld(opts){
  if(!_ready)throw new Error('FPhysX: init() first');
  opts=opts||{};
  var grav=opts.gravity??[0,-9.81,0],fs=opts.fixedStep??1/60,ccdP=opts.ccdMaxPasses??8,maxSub=opts.maxSubSteps??4;
  _vf(grav,'gravity');if(!Number.isFinite(fs)||fs<=0||!Number.isInteger(maxSub)||maxSub<1||!Number.isInteger(ccdP)||ccdP<1)throw new RangeError('fixedStep / maxSubSteps / ccdMaxPasses');
  var scale=new P.PxTolerancesScale();
  var physics=_physics;
  var sd=new P.PxSceneDesc(scale);
  var gv=_v3(grav[0],grav[1],grav[2]);sd.set_gravity(gv);P.destroy(gv);
  var dispatcher=P.DefaultCpuDispatcherCreate(0);sd.set_cpuDispatcher(dispatcher);
  var sceneFlags=sd.get_flags();sceneFlags.raise(P.PxSceneFlagEnum.eENABLE_CCD);sd.set_flags(sceneFlags);
  sd.set_ccdMaxPasses(ccdP);
  var sh=_shader();P.setupPassThroughFilterShader(sd,sh);
  var scene=physics.createScene(sd);P.destroy(sd);P.destroy(scale);
  var w={_physics:physics,_scene:scene,_shader:sh,_dispatcher:dispatcher,_bodies:new Map(),_statics:[],_nextId:1,
    _fixedStep:fs,_maxSub:maxSub,_acc:0,_disposed:false,
    addBox:function(pos,half,o){_alive(this);o=_options(o);_vf(pos,'pos');_vf(half,'half');
      if(half[0]<=0||half[1]<=0||half[2]<=0)throw new RangeError('half>0');
      return _addBody(this,pos,new P.PxBoxGeometry(half[0],half[1],half[2]),o||{});},
    addSphere:function(pos,r,o){_alive(this);o=_options(o);_vf(pos,'pos');if(!Number.isFinite(r)||r<=0)throw new RangeError('r>0');
      return _addBody(this,pos,new P.PxSphereGeometry(r),o||{});},
    addCapsule:function(pos,r,th,o){_alive(this);o=_options(o);_vf(pos,'pos');
      if(!Number.isFinite(r)||r<=0)throw new RangeError('r>0');
      if(!Number.isFinite(th)||th<=2*r)throw new RangeError('th>2r');
      var hh=(th-2*r)/2,id=_addBody(this,pos,new P.PxCapsuleGeometry(r,hh),o||{});
      var lp=_rotZ(Math.PI/2);this._bodies.get(id).shape.setLocalPose(lp);P.destroy(lp);var e=this._bodies.get(id);if(e.type==='dynamic')P.PxRigidBodyExt.prototype.setMassAndUpdateInertia(e.actor,o?.mass??1);return id;},
    remove:function(id){var e=this._bodies.get(id);if(!e)return;
      this._scene.removeActor(e.actor,true);e.actor.release();e.shape.release();this._bodies.delete(id);},
    step:function(dt){if(this._disposed)throw new Error('FPhysX: disposed world');
      if(!Number.isFinite(dt)||dt<0)throw new RangeError('dt>=0');if(dt===0)return false;
      this._acc+=dt;var n=0,ok=false;
      while(this._acc>=this._fixedStep&&n<this._maxSub){
        this._scene.simulate(this._fixedStep);this._scene.fetchResults(true);
        this._acc-=this._fixedStep;ok=true;n++;}
      if(n>=this._maxSub)this._acc%=this._fixedStep;return ok;},
    readPose:function(id){_alive(this);var e=this._bodies.get(id);if(!e)return null;
      var t=e.actor.getGlobalPose(),p=t.get_p(),q=t.get_q();
      return[p.get_x(),p.get_y(),p.get_z(),q.get_x(),q.get_y(),q.get_z(),q.get_w()];},
    readVelocity:function(id){_alive(this);var e=this._bodies.get(id);if(!e||e.type==='static')return null;
      var v=e.actor.getLinearVelocity();return[v.get_x(),v.get_y(),v.get_z()];},
    impulse:function(id,imp){_alive(this);var e=this._bodies.get(id);if(!e||e.type!=='dynamic')return;
      _vf(imp,'imp');var v=_v3(imp[0],imp[1],imp[2]);
      e.actor.addForce(v,P.PxForceModeEnum.eIMPULSE,true);P.destroy(v);},
    setVelocity:function(id,vel){_alive(this);var e=this._bodies.get(id);if(!e||e.type!=='dynamic')return;
      _vf(vel,'vel');var v=_v3(vel[0],vel[1],vel[2]);
      e.actor.setLinearVelocity(v,true);P.destroy(v);},
    setKinematicTarget:function(id,pose){_alive(this);var e=this._bodies.get(id);if(!e||e.type!=='kinematic')return;
      _vf(pose,'pose',7);if(Math.abs(Math.hypot(...pose.slice(3))-1)>1e-5)throw new RangeError('unit quaternion');var t=_pose(pose[0],pose[1],pose[2],pose[3],pose[4],pose[5],pose[6]);
      e.actor.setKinematicTarget(t);P.destroy(t);},
    setStatics:function(list){_alive(this);if(!Array.isArray(list))throw new TypeError('statics array');list=list.map(_box);
      for(var i=0;i<this._statics.length;i++){this._scene.removeActor(this._statics[i],true);this._statics[i].release();}
      this._statics=[];if(!list||!list.length)return;
      for(var j=0;j<list.length;j++){var s=list[j];_vf(s.center,'sc');_vf(s.half,'sh');
        if(s.half[0]<=0||s.half[1]<=0||s.half[2]<=0)throw new RangeError('sh>0');
        var g=new P.PxBoxGeometry(s.half[0],s.half[1],s.half[2]);
        var m=this._physics.createMaterial(0.5,0.5,0);
        var sf=new P.PxShapeFlags(P.PxShapeFlagEnum.eSIMULATION_SHAPE|P.PxShapeFlagEnum.eSCENE_QUERY_SHAPE);
        var shp=this._physics.createShape(g,m,true,sf);P.destroy(sf);P.destroy(g);m.release();
        var fd=new P.PxFilterData(0xFFFFFFFF,0xFFFFFFFF,0,0);shp.setSimulationFilterData(fd);P.destroy(fd);
        var po=_pose(s.center[0],s.center[1],s.center[2]);
        var ac=this._physics.createRigidStatic(po);P.destroy(po);
        ac.attachShape(shp);shp.release();this._scene.addActor(ac);this._statics.push(ac);}},
    dispose:function(){if(this._disposed)return;this._disposed=true;
      var ids=Array.from(this._bodies.keys());for(var i=0;i<ids.length;i++)this.remove(ids[i]);
      this._bodies.clear();
      for(var j=0;j<this._statics.length;j++){this._scene.removeActor(this._statics[j],true);this._statics[j].release();}
      this._statics=[];this._scene.release();P.destroy(this._dispatcher);P.destroy(this._shader);_worlds.delete(this);}
  };
  _worlds.add(w);return w;
}

function sweepBox(from,half,delta,obstacles,out){
  out=out||{};out.hit=false;out.distance=Infinity;out.fraction=1;out.nx=0;out.ny=0;out.nz=0;
  if(!_ready)throw new Error('FPhysX: init()');
  _vf(from,'from');_vf(half,'half');_vf(delta,'delta');
  if(half[0]<=0||half[1]<=0||half[2]<=0)throw new RangeError('half>0');
  var dx=delta[0],dy=delta[1],dz=delta[2],d=Math.sqrt(dx*dx+dy*dy+dz*dz);
  if(d<1e-9)return out;
  if(!Array.isArray(obstacles))obstacles=[obstacles];obstacles=obstacles.map(_box);if(!obstacles.length)return out;
  var dir=_v3(dx/d,dy/d,dz/d),gA=new P.PxBoxGeometry(half[0],half[1],half[2]);
  var pA=_pose(from[0],from[1],from[2]);
  var fl=new P.PxHitFlags(P.PxHitFlagEnum.eDEFAULT|P.PxHitFlagEnum.ePRECISE_SWEEP);
  var bd=Infinity,bnx=0,bny=0,bnz=0;
  for(var i=0;i<obstacles.length;i++){var ob=obstacles[i];
    _vf(ob.center,'oc');_vf(ob.half,'oh');
    var gB=new P.PxBoxGeometry(ob.half[0],ob.half[1],ob.half[2]);
    var pB=_pose(ob.center[0],ob.center[1],ob.center[2]);
    var hit=new P.PxSweepHit();
    var r=P.PxGeometryQuery.prototype.sweep(dir,d,gA,pA,gB,pB,hit,fl,0);_qc++;
    if(r){var hd=hit.get_distance();
      if(hit.hadInitialOverlap()){bd=0;bnx=0;bny=0;bnz=0;P.destroy(hit);P.destroy(gB);P.destroy(pB);break;}
      if(hd<bd){bd=hd;var n=hit.get_normal();bnx=n.get_x();bny=n.get_y();bnz=n.get_z();}}
    P.destroy(hit);P.destroy(gB);P.destroy(pB);}
  P.destroy(dir);P.destroy(gA);P.destroy(pA);P.destroy(fl);
  if(bd<Infinity){out.hit=true;out.distance=bd;out.fraction=bd/d;out.nx=bnx;out.ny=bny;out.nz=bnz;}
  return out;
}

function overlapBox(center,half,obstacles){
  if(!_ready)throw new Error('FPhysX: init()');
  _vf(center,'c');_vf(half,'h');
  if(half[0]<=0||half[1]<=0||half[2]<=0)throw new RangeError('half>0');
  if(!Array.isArray(obstacles))obstacles=[obstacles];obstacles=obstacles.map(_box);if(!obstacles.length)return false;
  var gA=new P.PxBoxGeometry(half[0],half[1],half[2]),pA=_pose(center[0],center[1],center[2]),f=false;
  for(var i=0;i<obstacles.length&&!f;i++){var ob=obstacles[i];
    var gB=new P.PxBoxGeometry(ob.half[0],ob.half[1],ob.half[2]);
    var pB=_pose(ob.center[0],ob.center[1],ob.center[2]);
    f=P.PxGeometryQuery.prototype.overlap(gA,pA,gB,pB);_qc++;
    P.destroy(gB);P.destroy(pB);}
  P.destroy(gA);P.destroy(pA);return f;
}

G.FPhysX=Object.freeze({init,isReady,status,createWorld,sweepBox,overlapBox,dispose,
  get queryCount(){return _qc}});
})(globalThis);
