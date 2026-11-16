/* FERRO — physical canvas sizing and passive frame budget observations. */
(function(G){'use strict';
function create(canvas,{environment:w=G,limit=16384,maxPixels=8847360,scale=1}={}){
  let device=[1,1],requested=scale,observer=null,started=false;
  const stats={device,buffer:[canvas.width||1,canvas.height||1],scale:1,capped:null,changes:0};
  const bounded=v=>Number.isFinite(v)?Math.max(.5,Math.min(1,v)):1;
  requested=bounded(requested);limit=Number.isFinite(limit)&&limit>0?limit:16384;maxPixels=Number.isFinite(maxPixels)&&maxPixels>0?maxPixels:8847360;
  function measure(){
    const dpr=Math.max(.1,Number(w.devicePixelRatio)||1),r=canvas.getBoundingClientRect?.();
    device[0]=Math.max(1,r?Math.round(r.right*dpr)-Math.round(r.left*dpr):Math.round((canvas.clientWidth||w.innerWidth||800)*dpr));
    device[1]=Math.max(1,r?Math.round(r.bottom*dpr)-Math.round(r.top*dpr):Math.round((canvas.clientHeight||w.innerHeight||600)*dpr));
    return device;
  }
  function size(){
    let factor=requested,capped=null;
    const safety=Math.sqrt(maxPixels/(device[0]*device[1]));if(factor>safety){factor=safety;capped='safety';}
    const hardware=Math.min(limit/device[0],limit/device[1]);if(factor>hardware){factor=hardware;capped='gpu';}
    stats.scale=factor;stats.capped=capped;
    return {width:Math.max(1,Math.floor(device[0]*factor+.000001)),height:Math.max(1,Math.floor(device[1]*factor+.000001)),ratio:factor*(w.devicePixelRatio||1)};
  }
  function record(width,height){if(started&&(stats.buffer[0]!==width||stats.buffer[1]!==height))stats.changes++;started=true;stats.buffer[0]=width;stats.buffer[1]=height;}
  measure();
  if(w.ResizeObserver)try{observer=new w.ResizeObserver(entries=>{const e=entries.find(e=>e.target===canvas)||entries[0],box=e?.devicePixelContentBoxSize,b=box?.[0]||box;
    if(b&&Number.isFinite(b.inlineSize)&&Number.isFinite(b.blockSize)&&b.inlineSize>0&&b.blockSize>0){device[0]=Math.round(b.inlineSize);device[1]=Math.round(b.blockSize);}else measure();
  });try{observer.observe(canvas,{box:'device-pixel-content-box'});}catch{observer.observe(canvas);}}catch{observer=null;}
  return {stats,measure,size,record,setScale(value){requested=bounded(value);},dispose(){observer?.disconnect();}};
}
function budget({target=60,onBudget}={}){
  const samples=new Float64Array(240),sorted=new Float64Array(240),log=[],stats={target,p50:0,p95:0,over:0,sustained:false};let count=0,at=0,ticks=0,elapsed=0,lastCall=-Infinity,announced=false;
  function update(ms){
    if(!Number.isFinite(ms)||ms<=0||ms>=500)return stats;
    elapsed+=ms;samples[at]=ms;at=(at+1)%240;count=Math.min(240,count+1);if(++ticks%60)return stats;
    sorted.fill(Infinity);sorted.set(samples.subarray(0,count));sorted.sort();stats.p50=sorted[Math.floor((count-1)*.5)];stats.p95=sorted[Math.floor((count-1)*.95)];
    let over=0;for(let i=0;i<count;i++)if(samples[i]>1000/stats.target*1.5)over++;stats.over=over/count;stats.sustained=count===240&&stats.over>.2;
    if(!stats.sustained)announced=false;
    if(stats.sustained&&!announced&&elapsed-lastCall>=5000){announced=true;lastCall=elapsed;const entry={...stats,timeMs:elapsed};log.push(entry);if(log.length>32)log.shift();onBudget?.(entry);}
    return stats;
  }
  return {stats,log,update,setTarget(value){if(Number.isFinite(value)&&value>0)stats.target=value;}};
}
G.FSurface={create,budget};
})(typeof window!=='undefined'?window:globalThis);
