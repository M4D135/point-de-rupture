(function(G){'use strict';
  // Opt-in instrumentation. No query or timing work is performed until create().
  function create(gl,options={}){
    const now=options.now||(()=>performance.now()),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),pending=[],history=[],limit=128;
    const stats={gpu:!!ext,frames:0,discarded:0,overflow:0,pending:0,history};
    let frame=0,active=null,row=null,omitted=new Set(options.omit||[]),disposed=false;
    function poll(){
      if(!ext)return;
      if(gl.getParameter(ext.GPU_DISJOINT_EXT)){
        for(const item of pending){gl.deleteQuery(item.query);item.row.valid=false;stats.discarded++;}pending.length=0;
      }else for(let i=0;i<pending.length;){
        const item=pending[i];
        if(frame-item.frame<2||!gl.getQueryParameter(item.query,gl.QUERY_RESULT_AVAILABLE)){i++;continue;}
        const ns=gl.getQueryParameter(item.query,gl.QUERY_RESULT);gl.deleteQuery(item.query);pending.splice(i,1);
        if(Number.isFinite(ns)&&ns>=0){item.row.gpu[item.name]=(item.row.gpu[item.name]||0)+ns/1e6;item.row.completed++;}else{item.row.valid=false;stats.discarded++;}
      }
      stats.pending=pending.length;
    }
    function start(){if(disposed)return;frame++;poll();row={frame,cpu:{},gpu:{},queries:0,completed:0,valid:true};history.push(row);if(history.length>240)history.shift();stats.frames=frame;}
    function begin(name){
      if(disposed||omitted.has(name)||omitted.has(name.replace(/\d+$/,'')))return false;
      if(active)throw new Error('Overlapping GPU profile passes');
      if(!row)start();active={name,time:now(),query:null,row,frame};
      if(ext&&pending.length<limit){const query=gl.createQuery();if(query){gl.beginQuery(ext.TIME_ELAPSED_EXT,query);active.query=query;row.queries++;}}else if(ext){stats.overflow++;row.valid=false;}
      return true;
    }
    function end(){if(!active)return;const item=active;active=null;item.row.cpu[item.name]=(item.row.cpu[item.name]||0)+Math.max(0,now()-item.time);if(item.query){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(item);stats.pending=pending.length;}}
    function dispose(){if(disposed)return;end();for(const item of pending)gl.deleteQuery(item.query);pending.length=0;stats.pending=0;disposed=true;}
    return {start,begin,end,poll,dispose,stats,configure(value){omitted=new Set(value?.omit||[]);},reset(){end();for(const item of pending)gl.deleteQuery(item.query);pending.length=0;history.length=0;row=null;stats.pending=0;}};
  }
  G.FGPUProfile={create};
})(typeof window!=='undefined'?window:globalThis);
