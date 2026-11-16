/* METAL — original procedural tactical network, not a trained/imported model.
 * WebNN API: https://www.w3.org/TR/2026/CRD-webnn-20261021/
 * Accelerated is reported by the API; the exact GPU/NPU is deliberately hidden.
 */
(function(G){
  'use strict';
  const INPUTS=16,HIDDEN=20,OUTPUTS=8,BATCH=16,VERSION=1;
  const ACTIONS=['advance','flank','retreat','hold','slam','ring','rocketZone','sweep'];
  // Inputs contain only an actor's own state, visible allies and last observation:
  // distance, proximity, injury, sight, memory, crowd, observed speed/height,
  // assault/flanker/suppressor role, readiness, phase, giant, pain, variation.
  const w1=new Float32Array(INPUTS*HIDDEN),b1=new Float32Array(HIDDEN),w2=new Float32Array(HIDDEN*OUTPUTS);
  for(let i=0;i<INPUTS;i++)w1[i*HIDDEN+i]=1;
  for(const [h,b,terms] of [[16,-.65,[[1,1],[14,.8]]],[17,-.65,[[5,1],[7,.7]]],[18,-.8,[[6,1],[0,.7]]],[19,-.6,[[2,1],[3,.5]]]]){b1[h]=b;for(const [i,w] of terms)w1[i*HIDDEN+h]=w;}
  const b2=new Float32Array([.25,.15,-.7,.15,.1,.15,.2,.1]);
  const weights=[
    [[0,2.5],[1,-1.2],[2,-.8],[3,.3],[4,.2],[5,-.7],[7,-.3],[8,.7],[14,-.4]],
    [[0,.85],[1,-.35],[2,-.2],[3,.4],[5,1.25],[6,.5],[7,.75],[9,1.1],[17,.6]],
    [[0,-.6],[1,2.5],[2,1.25],[5,.8],[10,.5],[14,.9],[16,.6],[19,.6]],
    [[0,-.55],[1,-.8],[3,.8],[5,-.65],[7,-.2],[10,1.35],[11,.5]],
    [[0,-1],[1,3],[3,.2],[6,-.8]],
    [[0,1.5],[1,-.5],[6,.9],[12,.8],[15,.25],[18,.3]],
    [[0,2.2],[6,-.7],[7,.7],[12,.6]],
    [[0,.8],[6,1.3],[12,.6],[15,.3],[18,.6]]
  ];
  weights.forEach((terms,o)=>{for(const [h,w] of terms)w2[h*OUTPUTS+o]=w;});
  const clamp=v=>Math.max(0,Math.min(1,v));
  function packed(rows){
    if(!Array.isArray(rows)||rows.length<1||rows.length>BATCH)throw new RangeError('Invalid tactical batch');
    const input=new Float32Array(BATCH*INPUTS);
    for(let n=0;n<rows.length;n++){const row=rows[n];if(!row||row.length!==INPUTS)throw new RangeError('Invalid tactical features');for(let i=0;i<INPUTS;i++){if(!Number.isFinite(row[i]))throw new TypeError('Non-finite tactical feature');input[n*INPUTS+i]=clamp(row[i]);}}
    return input;
  }
  function infer(input,count){
    const result=new Float32Array(count*OUTPUTS),hidden=new Float32Array(HIDDEN);
    for(let n=0;n<count;n++){
      for(let h=0;h<HIDDEN;h++){let v=0;for(let i=0;i<INPUTS;i++)v+=input[n*INPUTS+i]*w1[i*HIDDEN+h];hidden[h]=Math.max(0,Math.fround(Math.fround(v)+b1[h]));}
      for(let o=0;o<OUTPUTS;o++){let v=0;for(let h=0;h<HIDDEN;h++)v+=hidden[h]*w2[h*OUTPUTS+o];result[n*OUTPUTS+o]=Math.fround(Math.fround(v)+b2[o]);}
    }
    return result;
  }
  const cpu=rows=>infer(packed(rows),rows.length);
  function create(options={}){
    let mode=options.mode==='cpu'?'cpu':'auto',generation=0,disposed=false,resource=null,candidate=null,preparing=null,busy=null;
    let backend='cpu',reason=mode==='cpu'?'selected':'not-prepared';
    const metrics={batches:0,actors:0,acceleratedBatches:0,cpuBatches:0,failures:0};
    const status=()=>({mode,backend,accelerated:backend==='webnn',reason,generation,
      label:backend==='preparing'?'Préparation de l’IA accélérée…':backend==='webnn'?'WebNN accéléré · type GPU/NPU non exposé':reason==='selected'?'CPU · compatibilité':reason==='unavailable'?'CPU · WebNN indisponible':reason==='unverified'?'CPU · accélérateur non confirmé':reason==='disposed'?'CPU · arrêté':reason==='not-prepared'?'CPU · en attente de préparation':'CPU · repli de compatibilité'});
    function destroy(q){if(!q)return;q.destroyed=true;for(const key of ['input','output','graph','context']){try{q[key]?.destroy?.();}catch(_){/* An already-lost device may reject destruction. */}q[key]=null;}}
    function release(){destroy(resource);destroy(candidate);resource=candidate=null;busy=null;}
    function fallback(why,ticket){if(ticket!==generation||disposed)return;metrics.failures++;generation++;release();backend='cpu';reason=why;}
    function deadline(promise,ms){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),ms);})]).finally(()=>clearTimeout(timer));}
    function valid(q,ticket){if(disposed||ticket!==generation||q.destroyed)throw new Error('superseded');}
    async function run(q,input){
      q.context.writeTensor(q.input,input);q.context.dispatch(q.graph,{features:q.input},{scores:q.output});
      const raw=await q.context.readTensor(q.output),values=new Float32Array(raw);
      if(values.length!==BATCH*OUTPUTS||!values.every(v=>Number.isFinite(v)&&Math.abs(v)<100))throw new Error('invalid-output');
      return values;
    }
    async function build(ticket){
      const q={context:null,graph:null,input:null,output:null,destroyed:false};candidate=q;
      try{
        q.context=await G.navigator.ml.createContext({powerPreference:'low-power',accelerated:true});valid(q,ticket);
        // Never mistake an ignored legacy deviceType hint for proof of an NPU.
        if(q.context.accelerated!==true)throw new Error('unverified');
        const c=q.context;if(!['createTensor','writeTensor','dispatch','readTensor'].every(k=>typeof c[k]==='function'))throw new Error('unsupported-api');
        if(c.lost&&typeof c.lost.then==='function')c.lost.then(()=>fallback('context-lost',ticket),()=>fallback('context-lost',ticket));
        const builder=new G.MLGraphBuilder(c),constant=(shape,value)=>builder.constant({dataType:'float32',shape},value);
        const input=builder.input('features',{dataType:'float32',shape:[BATCH,INPUTS]});
        const hidden=builder.relu(builder.add(builder.matmul(input,constant([INPUTS,HIDDEN],w1)),constant([HIDDEN],b1)));
        const output=builder.add(builder.matmul(hidden,constant([HIDDEN,OUTPUTS],w2)),constant([OUTPUTS],b2));
        q.graph=await builder.build({scores:output});valid(q,ticket);
        q.input=await c.createTensor({dataType:'float32',shape:[BATCH,INPUTS],writable:true});valid(q,ticket);
        q.output=await c.createTensor({dataType:'float32',shape:[BATCH,OUTPUTS],readable:true});valid(q,ticket);
        // A tiny real dispatch verifies arithmetic before gameplay trusts this path.
        const probe=new Float32Array(BATCH*INPUTS);for(let i=0;i<probe.length;i++)probe[i]=((i*13+5)%31)/30;
        const actual=await run(q,probe),expected=infer(probe,BATCH);valid(q,ticket);
        if(actual.some((v,i)=>Math.abs(v-expected[i])>1e-4))throw new Error('numeric-mismatch');
        return q;
      }catch(error){destroy(q);throw error;}
    }
    function prepare(){
      if(disposed||mode==='cpu'||resource)return Promise.resolve(status());
      if(preparing)return preparing;
      if(!G.navigator?.ml?.createContext||typeof G.MLGraphBuilder!=='function'){backend='cpu';reason='unavailable';return Promise.resolve(status());}
      const ticket=++generation;backend='preparing';reason='initializing';
      const job=deadline(build(ticket),2500).then(q=>{
        if(disposed||ticket!==generation){destroy(q);return status();}
        candidate=null;resource=q;backend='webnn';reason='accelerated-reported';return status();
      }).catch(error=>{fallback(error?.message==='unverified'?'unverified':error?.message==='timeout'?'prepare-timeout':'prepare-failed',ticket);return status();}).finally(()=>{if(preparing===job)preparing=null;});
      preparing=job;return job;
    }
    function evaluate(rows){
      const input=packed(rows),count=rows.length,ticket=generation;
      metrics.batches++;metrics.actors+=count;
      const local=()=>{metrics.cpuBatches++;return {scores:infer(input,count),count,backend:'cpu',generation};};
      if(disposed||!resource||backend!=='webnn'||busy)return local();
      const q=resource,request={ticket};busy=request;
      return deadline(run(q,input),120).then(values=>{
        if(disposed||generation!==ticket||q!==resource)return local();
        metrics.acceleratedBatches++;return {scores:values.slice(0,count*OUTPUTS),count,backend:'webnn',generation:ticket};
      }).catch(error=>{fallback(error?.message==='timeout'?'inference-timeout':'inference-failed',ticket);return local();}).finally(()=>{if(busy===request)busy=null;});
    }
    function setMode(next){
      if(next!=='auto'&&next!=='cpu')return Promise.resolve(status());
      if(disposed)return Promise.resolve(status());
      if(next===mode&&(resource||preparing||mode==='cpu'))return prepare();
      generation++;release();preparing=null;mode=next;backend='cpu';reason=mode==='cpu'?'selected':'not-prepared';return prepare();
    }
    function dispose(){if(disposed)return;disposed=true;generation++;release();preparing=null;backend='cpu';reason='disposed';}
    return {prepare,setMode,evaluate,dispose,get status(){return status();},get metrics(){return {...metrics};}};
  }
  G.FBrain={create,cpu,version:VERSION,inputs:INPUTS,outputs:OUTPUTS,batchSize:BATCH,actions:ACTIONS.slice()};
})(typeof window!=='undefined'?window:globalThis);
