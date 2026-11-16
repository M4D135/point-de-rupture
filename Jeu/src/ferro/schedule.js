/* FERRO — task scheduler: 'frame' lane on a per-frame time budget, 'sim' lane in deterministic work units. Reads no clock of its own. */
(function(G){
  'use strict';
  function create(o={}){
    const now=o.now,aging=o.agingFrames??30;
    if(now!==undefined&&typeof now!=='function')throw new TypeError('FSchedule: now must be a function');
    if(!Number.isInteger(aging)||aging<1)throw new TypeError('FSchedule: agingFrames must be a positive integer');
    const frameQ=[],simQ=[],stats={ran:0,skipped:0,flushes:0,overrunMs:0,maxSliceMs:0,simUnits:0,errors:0};
    let seq=0,pumps=0;
    const queue=t=>t.lane==='sim'?simQ:frameQ,eff=t=>t.priority-Math.floor(t.age/aging);
    function drop(t){const q=queue(t),i=q.indexOf(t);if(i>=0)q.splice(i,1);t.removed=true;}
    function find(key){return frameQ.find(t=>t.key===key)||simQ.find(t=>t.key===key);}
    function call(t,arg){try{return t.run(arg,t);}catch(e){drop(t);stats.errors++;throw e;}}
    // Sim tasks report the integer units they used; anything else is a bug in the task.
    function units(t,left){
      const used=call(t,left);t.runs++;
      if(!Number.isInteger(used)||used<0||used>left){drop(t);stats.errors++;throw new TypeError('FSchedule: a sim task must return an integer in [0, units]');}
      stats.simUnits+=used;if(t.done)drop(t);return used;
    }
    function add(task){
      if(!task||typeof task.run!=='function')throw new TypeError('FSchedule.add: run must be a function');
      const lane=task.lane??'frame';if(lane!=='frame'&&lane!=='sim')throw new TypeError("FSchedule.add: lane must be 'frame' or 'sim'");
      const q=lane==='sim'?simQ:frameQ;
      if(task.key!==undefined)for(const t of q.slice())if(t.key===task.key)drop(t);
      const t={lane,key:task.key,priority:Number.isFinite(task.priority)?task.priority:5,cost:Number.isFinite(task.cost)&&task.cost>=0?task.cost:1,
        run:task.run,seq:seq++,age:0,runs:0,spentMs:0,done:false,removed:false,lastPump:0};
      q.push(t);return t;
    }
    function cancel(key){let hit=false;for(const t of [...frameQ,...simQ])if(t.key===key){drop(t);hit=true;}return hit;}
    function pump(budget){
      if(!now)throw new TypeError('FSchedule.pump: create({now}) is required');
      if(!(budget>0)||!frameQ.length)return 0;
      const id=++pumps,list=frameQ.slice().sort((a,b)=>eff(a)-eff(b)||a.seq-b.seq),start=now();
      let used=0,ran=0;
      for(const t of list){
        if(t.removed)continue;
        const left=budget-used;if(left<=0)break;
        if(ran&&t.cost>left){stats.skipped++;continue;}
        const t0=now(),r=call(t,t0+left),d=now()-t0;
        t.cost=t.cost*.5+d*.5;t.runs++;t.spentMs+=d;t.age=0;t.lastPump=id;ran++;stats.ran++;if(d>stats.maxSliceMs)stats.maxSliceMs=d;
        if(r!==false){t.done=true;drop(t);}
        used=now()-start;
      }
      for(const t of list)if(!t.removed&&t.lastPump!==id)t.age++;
      if(used>budget)stats.overrunMs+=used-budget;
      return used;
    }
    function pumpSim(n){
      if(!Number.isInteger(n)||n<0)throw new TypeError('FSchedule.pumpSim: units must be a non-negative integer');
      let left=n;
      for(const t of simQ.slice().sort((a,b)=>a.priority-b.priority||a.seq-b.seq)){
        if(!left)break;if(t.removed)continue;
        left-=units(t,left);
      }
      return n-left;
    }
    function flush(key){
      const t=find(key);if(!t)return false;stats.flushes++;
      for(let i=0;i<1e6;i++){
        if(t.lane==='sim'){units(t,Number.MAX_SAFE_INTEGER);if(t.done)return true;}
        else{const r=call(t,Infinity);t.runs++;if(r!==false){t.done=true;drop(t);return true;}}
      }
      throw new Error('FSchedule.flush: task never finished');
    }
    return {add,cancel,has:key=>!!find(key),pump,pumpSim,flush,stats,
      count:lane=>lane==='frame'?frameQ.length:lane==='sim'?simQ.length:frameQ.length+simQ.length};
  }
  // Frame-lane budget: what is left of 85 % of the display period, at most cap ms, never negative.
  function budget(period,work,cap=4){
    const P=Number.isFinite(period)&&period>0?period:1000/60;
    return Number.isFinite(work)?Math.max(0,Math.min(cap,.85*P-work)):0;
  }
  G.FSchedule={create,budget};
})(typeof window!=='undefined'?window:globalThis);
