/* FERRO — optional background jobs, chunked values and a complete in-page fallback. */
(function(G){'use strict';
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function transfers(value,out=[],seen=new Set()){
    if(!value||typeof value!=='object'||seen.has(value))return out;seen.add(value);
    if(ArrayBuffer.isView(value)){if(!seen.has(value.buffer)){seen.add(value.buffer);out.push(value.buffer);}return out;}
    if(value instanceof ArrayBuffer){out.push(value);return out;}
    for(const v of Object.values(value))transfers(v,out,seen);return out;
  }
  function stream(id,value,send,size=2000){
    if(!Number.isInteger(size)||size<1||size>2000)throw new RangeError('Chunk size must be in [1, 2000]');
    const object=value&&typeof value==='object'&&!Array.isArray(value)&&!ArrayBuffer.isView(value)&&!(value instanceof ArrayBuffer),arrays=[];
    let head=value;if(object){head={};for(const [key,v] of Object.entries(value)){if(key==='__proto__')throw new Error('Unsupported key');if(Array.isArray(v)){head[key]=[];arrays.push([key,v]);}else head[key]=v;}}
    send({t:'head',id,value:head},transfers(head));
    for(const [key,list] of arrays)for(let at=0;at<list.length;at+=size){const part=list.slice(at,at+size);send({t:'part',id,key,at,value:part},transfers(part));}
    send({t:'done',id});
  }
  function serve(handlers,endpoint=G){
    const send=(value,transfer)=>endpoint.postMessage(value,transfer||[]);
    endpoint.onmessage=async event=>{const q=event.data;if(!q||typeof q!=='object')return;
      if(q.t==='ping'){send({t:'pong'});return;}
      if(q.t!=='job'||!Number.isSafeInteger(q.id)||!own(handlers,q.name))return;
      try{stream(q.id,await handlers[q.name](q.data),send);}catch(error){send({t:'error',id:q.id,message:String(error?.message||error)});}
    };
    send({t:'ready'});
  }
  function create({environment:Genv=G,handlers={},bootstrap='',selector='script[data-worker]',forceMain=false,name='ferro-jobs'}={}){
    const w=Genv,pending=new Map();let worker=null,url=null,timer=null,serial=0,mode='main',reason='unavailable',disposed=false,lastAck=0;
    const now=()=>w.performance?.now?.()??Date.now(),stats={requests:0,completed:0,fallbacks:0,chunks:0};
    function close(){if(timer!==null)w.clearInterval?.(timer);timer=null;try{worker?.terminate();}catch{}worker=null;if(url){w.URL.revokeObjectURL(url);url=null;}}
    function local(q){Promise.resolve().then(()=>handlers[q.name](q.data)).then(value=>{if(pending.delete(q.id)){stats.completed++;q.resolve(value);}},error=>{if(pending.delete(q.id))q.reject(error);});}
    function fallback(why){if(disposed)return;const previous=mode;mode='main';reason=why;close();if(previous!=='main'){stats.fallbacks++;for(const q of pending.values()){q.value=undefined;q.started=false;local(q);}}}
    function receive(event){const m=event.data;if(!m||typeof m!=='object'||disposed||mode==='main')return;lastAck=now();
      if(m.t==='ready'){if(mode!=='starting')return;mode='worker';reason='ready';if(url){w.URL.revokeObjectURL(url);url=null;}try{for(const q of pending.values())worker.postMessage({t:'job',id:q.id,name:q.name,data:q.data});}catch{fallback('post-error');}return;}
      if(m.t==='pong')return;const q=pending.get(m.id);if(!q)return;
      if(m.t==='head'){q.value=m.value;q.started=true;return;}
      if(m.t==='part'){
        if(!q.started||!q.value||!own(q.value,m.key)||!Array.isArray(q.value[m.key])||!Array.isArray(m.value)||m.value.length>2000||m.at!==q.value[m.key].length){fallback('invalid-stream');return;}
        const list=q.value[m.key];for(const item of m.value)list.push(item);stats.chunks++;return;
      }
      if(m.t==='done'){if(!q.started){fallback('invalid-stream');return;}pending.delete(m.id);stats.completed++;q.resolve(q.value);}
      else if(m.t==='error'){pending.delete(m.id);q.reject(new Error(m.message||'Background job failed'));}
    }
    try{
      const mobile=w.matchMedia?.('(pointer:coarse)')?.matches;
      if(!forceMain&&(!mobile||(w.navigator?.hardwareConcurrency||0)>=4)&&w.Worker&&w.Blob&&w.URL?.createObjectURL&&bootstrap){
        const nodes=w.document?.querySelectorAll?.(selector)||[],source=Array.from(nodes,n=>n.textContent).join('\n;\n');
        if(source){mode='starting';reason='starting';lastAck=now();url=w.URL.createObjectURL(new w.Blob(['self.window=self;\n',source,'\n;',bootstrap],{type:'text/javascript'}));worker=new w.Worker(url,{name});worker.onmessage=receive;worker.onerror=e=>{e.preventDefault?.();fallback('worker-error');};worker.onmessageerror=()=>fallback('message-error');
          timer=w.setInterval?.(()=>{if(w.document?.hidden){lastAck=now();return;}if(now()-lastAck>3000){fallback('timeout');return;}if(mode==='worker')worker.postMessage({t:'ping'});},1000)??null;
        }
      }else if(forceMain)reason='selected';else if(mobile)reason='mobile-capacity';
    }catch{fallback('startup-error');}
    function request(job,data){
      if(disposed)return Promise.reject(new Error('Background jobs disposed'));
      if(typeof job!=='string'||!own(handlers,job)||typeof handlers[job]!=='function')return Promise.reject(new Error('Unknown background job'));
      stats.requests++;return new Promise((resolve,reject)=>{const q={id:++serial,name:job,data,resolve,reject,value:undefined,started:false};pending.set(q.id,q);
        if(mode==='main')local(q);else if(mode==='worker')try{worker.postMessage({t:'job',id:q.id,name:job,data});}catch{fallback('post-error');}
      });
    }
    function dispose(){if(disposed)return;disposed=true;close();for(const q of pending.values())q.reject(new Error('Background jobs disposed'));pending.clear();}
    return {request,dispose,stats,get mode(){return mode;},get reason(){return reason;}};
  }
  G.FJobs={create,serve,stream};
})(typeof window!=='undefined'?window:globalThis);
