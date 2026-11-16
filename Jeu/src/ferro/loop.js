/* FERRO — fixed-step loop: accumulator, display-period lock, bounded catch-up, render interpolation. Reads no clock. */
(function(G){
  'use strict';
  const TAU=Math.PI*2;
  function create(o={}){
    const hz=o.hz??60,maxSteps=o.maxSteps??5;
    if(!Number.isFinite(hz)||hz<1||hz>1000)throw new TypeError('FLoop: hz must be in [1, 1000]');
    if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>60)throw new TypeError('FLoop: maxSteps must be an integer in [1, 60]');
    const maxFrameMs=o.maxFrameMs??250,N=o.samples??30,minSamples=o.minSamples??8,snap=o.snap??.2,sampleTol=o.sampleTol??.3,
      lockTol=o.lock??.01,unlockTol=o.unlock??.02,debtRate=o.debtRate??.1,debtCap=o.debtCap??2,fill=o.fill??.999;
    const H=1000/hz,h=1/hz,ring=new Float64Array(N);
    let count=0,at=0,misses=0,last=NaN,acc=fill*H,debt=0,locked=false,period=0;
    const frame={steps:0,alpha:fill,raw:0,dt:0,dropped:0,locked:false,period:0};
    const stats={frames:0,steps:0,zeroStepFrames:0,multiStepFrames:0,realMs:0,droppedMs:0,clampedMs:0,abortedMs:0,dilationMs:0,maxDebtMs:0,lockChanges:0};
    // Display period: mean of the last N intervals, each divided by its whole number of periods.
    function sample(raw){
      const k=Math.max(1,Math.round(raw/(count?period:raw))),v=raw/k;
      if(count>=minSamples&&Math.abs(v-period)>sampleTol*period){if(++misses<minSamples)return;count=at=0;}
      misses=0;ring[at]=v;at=(at+1)%N;if(count<N)count++;
      let s=0;for(let i=0;i<count;i++)s+=ring[i];period=s/count;
    }
    // Phase reset: the accumulator restarts just below one step; the jump is booked as dilation.
    function rebase(){stats.dilationMs+=fill*H-acc-debt;acc=fill*H;debt=0;}
    function lock(){
      const m=Math.max(1,Math.round(period/H)),dev=Math.abs(period-m*H)/(m*H);
      const want=count>=minSamples&&dev<=(locked?unlockTol:lockTol);
      if(want===locked)return;
      locked=want;stats.lockChanges++;if(locked)rebase();
    }
    function clear(){frame.steps=0;frame.raw=0;frame.dt=0;frame.dropped=0;}
    function finish(){frame.alpha=Math.max(0,Math.min(1,acc/H));frame.locked=locked;frame.period=period;return frame;}
    function run(n,step){
      let done=step?0:n;
      try{if(step)while(done<n){done++;if(step(h,done-1)===false)break;}}
      finally{
        if(done<n)stats.abortedMs+=(n-done)*H;
        frame.steps=done;stats.steps+=done;stats.frames++;
        if(!done)stats.zeroStepFrames++;else if(done>1)stats.multiStepFrames++;
        finish();
      }
      return frame;
    }
    function advance(now,step){
      if(step!=null&&typeof step!=='function')throw new TypeError('FLoop.advance: step must be a function');
      clear();
      if(!Number.isFinite(now))return finish();
      if(!Number.isFinite(last)){last=now;stats.dilationMs+=H;frame.dt=H;return run(1,step);}
      let raw=now-last;
      if(raw<0){last=now;return finish();}
      last=now;
      if(raw>maxFrameMs){stats.clampedMs+=raw-maxFrameMs;raw=maxFrameMs;}else if(raw>0)sample(raw);
      frame.raw=raw;stats.realMs+=raw;lock();
      let n=0;
      if(locked){
        n=Math.round(raw/H);stats.dilationMs+=n*H-raw;frame.dt=n*H;
        if(n>maxSteps){frame.dropped=(n-maxSteps)*H;n=maxSteps;}
      }else{
        let dt=raw;
        if(count>=minSamples){const k=Math.max(1,Math.round(raw/period));if(Math.abs(raw-k*period)<snap*period){dt=k*period;debt+=raw-dt;}}
        let fix=Math.max(-debtCap,Math.min(debtCap,debt))*debtRate;
        if(debt-fix>H)fix=debt-H;else if(debt-fix<-H)fix=debt+H;
        dt+=fix;debt-=fix;frame.dt=dt;acc+=dt;
        while(acc>=H*(1-1e-9)&&n<maxSteps){acc-=H;n++;}
        if(n===maxSteps&&acc>=H*(1-1e-9)){frame.dropped=acc-fill*H;acc=fill*H;}
      }
      stats.droppedMs+=frame.dropped;if(Math.abs(debt)>stats.maxDebtMs)stats.maxDebtMs=Math.abs(debt);
      return run(n,step);
    }
    function abort(done){
      if(!Number.isInteger(done)||done<0||done>frame.steps)throw new TypeError('FLoop.abort: done must be an integer in [0, frame.steps]');
      const cut=frame.steps-done;
      if(cut){stats.abortedMs+=cut*H;stats.steps-=cut;if(frame.steps>1&&done<2)stats.multiStepFrames--;if(!done)stats.zeroStepFrames++;frame.steps=done;}
      return frame;
    }
    function observe(now){
      clear();
      if(Number.isFinite(now)){if(now>last&&now-last<=maxFrameMs)sample(now-last);last=now;lock();}
      return finish();
    }
    function reset(){clear();rebase();last=NaN;return finish();}
    function resetPeriod(){clear();count=at=misses=0;period=0;if(locked){locked=false;stats.lockChanges++;}return finish();}
    return {advance,observe,abort,reset,resetPeriod,frame,stats,hz,step:h,stepMs:H,
      get period(){return period;},get locked(){return locked;},get acc(){return acc;},get debt(){return debt;}};
  }
  // View angles shown this frame: simulation angles plus look not yet consumed, same operations as the step.
  function aim(yaw,pitch,lookX,lookY,min=-Infinity,max=Infinity,out={}){
    out.yaw=yaw+(Number.isFinite(lookX)?lookX:0);
    out.pitch=Math.max(min,Math.min(max,pitch+(Number.isFinite(lookY)?lookY:0)));
    return out;
  }
  // Previous poses for render interpolation; one tracker per entity kind (ids are per kind).
  function track(o={}){
    const snap=o.snap??2,map=new Map();let gen=0;
    const wrap=d=>d-TAU*Math.round(d/TAU);
    return {
      begin(){gen++;},
      save(id,x,y,z,a=0){let e=map.get(id);if(!e)map.set(id,e=new Float64Array(5));e[0]=x;e[1]=y;e[2]=z;e[3]=a;e[4]=gen;},
      pose(id,x,y,z,a=0,alpha=1,out={}){
        const e=map.get(id);
        if(e){const dx=x-e[0],dy=y-e[1],dz=z-e[2];if(dx*dx+dy*dy+dz*dz<=snap*snap){out.x=e[0]+dx*alpha;out.y=e[1]+dy*alpha;out.z=e[2]+dz*alpha;out.a=e[3]+wrap(a-e[3])*alpha;return out;}}
        out.x=x;out.y=y;out.z=z;out.a=a;return out;
      },
      prune(){for(const [id,e] of map)if(e[4]!==gen)map.delete(id);},
      clear(){map.clear();},
      get size(){return map.size;}
    };
  }
  // Reusable render mirrors. Histories are keyed by object identity, so newly
  // spawned/replaced bodies never inherit another body's previous position.
  function view({single=[],many=[]}={}){
    let previous=new WeakMap(),mirrors=new WeakMap();const result={},lists=Object.fromEntries(many.map(key=>[key,[]]));
    function save(e){let q=previous.get(e);if(!q)previous.set(e,q=new Float64Array(5));q[0]=e.x;q[1]=e.y||0;q[2]=e.z;q[3]=e.yaw||0;q[4]=e.baseY||0;}
    function body(e,alpha,angles){let q=mirrors.get(e);if(!q)mirrors.set(e,q={});Object.assign(q,e);const before=previous.get(e);if(!before)return q;
      const dx=e.x-before[0],dy=(e.y||0)-before[1],dz=e.z-before[2];if(dx*dx+dy*dy+dz*dz>4)return q;
      q.x=before[0]+dx*alpha;q.y=before[1]+dy*alpha;q.z=before[2]+dz*alpha;
      if(e.baseY!==undefined)q.baseY=before[4]+(e.baseY-before[4])*alpha;
      if(angles&&e.yaw!==undefined){const delta=e.yaw-before[3];q.yaw=before[3]+(delta-TAU*Math.round(delta/TAU))*alpha;}return q;
    }
    return {capture(state){for(const key of single)save(state[key]);for(const key of Object.keys(lists))for(const e of state[key]||[])save(e);},
      render(state,alpha=1){alpha=Math.max(0,Math.min(1,alpha));Object.assign(result,state);for(const key of single)result[key]=body(state[key],alpha,false);
        for(const [key,list] of Object.entries(lists)){const source=state[key]||[];list.length=source.length;for(let i=0;i<source.length;i++)list[i]=body(source[i],alpha,true);result[key]=list;}return result;},
      clear(){previous=new WeakMap();mirrors=new WeakMap();for(const list of Object.values(lists))list.length=0;}};
  }
  G.FLoop={create,aim,track,view};
})(typeof window!=='undefined'?window:globalThis);
