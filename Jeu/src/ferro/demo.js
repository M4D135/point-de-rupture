/* FERRO — mode démo : outils déterministes, enregistrement et rejeu d'entrées, réalisateur, enchaînement de scènes. Sans DOM, horloge injectée pour l’accueil ; noyau de rejeu sans aléa global. */
(function(G){
  'use strict';
  const TAU=Math.PI*2,FNV=2166136261,PRIME=16777619,FORMAT=1,MAGIC='FDM1';
  const fail=(code,message,extra)=>{throw Object.assign(new Error('FDemo : '+message),{code},extra);};
  function utf8(text){
    const s=unescape(encodeURIComponent(text)),bytes=new Uint8Array(s.length);
    for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);
    return bytes;
  }
  function fromUtf8(bytes){
    let s='';
    for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));
    try{return decodeURIComponent(escape(s));}catch{return fail('FDEMO_FORMAT','texte encodé hors UTF-8');}
  }
  // États en tableaux typés : un nombre gardé dans une fermeture serait mis en boîte à chaque écriture.
  function rng(seed){
    const state=new Int32Array(1);state[0]=seed;
    function u32(){
      let a=state[0];
      a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;
      state[0]=a;return (t^(t>>>14))>>>0;
    }
    const next=()=>u32()/4294967296,weight=w=>Number.isFinite(w)&&w>0?w:0;
    function pick(weights,n=weights.length){
      let sum=0,cum=0,last=-1;
      for(let i=0;i<n;i++)sum+=weight(weights[i]);
      const r=next()*sum;
      if(!(sum>0))return -1;
      for(let i=0;i<n;i++){const w=weight(weights[i]);if(w>0){cum+=w;last=i;if(r<cum)return i;}}
      return last;
    }
    return {u32,next,pick,int:n=>n>=1?Math.floor(next()*n):0,range:(lo,hi)=>lo+(hi-lo)*next(),
      get state(){return state[0]>>>0;},set state(v){state[0]=v;}};
  }
  function hasher(seed=FNV){
    const state=new Uint32Array(1),view=new DataView(new ArrayBuffer(8));
    const byte=v=>{state[0]=Math.imul(state[0]^(v&255),PRIME);return api;};
    const word=v=>{let h=state[0];for(let k=0;k<32;k+=8)h=Math.imul(h^(v>>>k&255),PRIME);state[0]=h;return api;};
    function number(v){view.setFloat64(0,v,true);let h=state[0];for(let i=0;i<8;i++)h=Math.imul(h^view.getUint8(i),PRIME);state[0]=h;return api;}
    function text(s){
      word(s.length);let h=state[0];
      for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);h=Math.imul(Math.imul(h^(c&255),PRIME)^(c>>>8),PRIME);}
      state[0]=h;return api;
    }
    const api={byte,word,number,bool:v=>byte(v?1:0),text,result:()=>state[0],reset(s=FNV){state[0]=s;return api;}};
    state[0]=seed;
    return api;
  }
  const seedFor=(seed,a,b)=>hasher().word(seed).word(a).word(b).result();
  function smootherstep(t){
    if(!Number.isFinite(t))return 0;
    t=t<0?0:t>1?1:t;
    return t*t*t*(t*(t*6-15)+10);
  }
  function wrapAngle(a){
    if(!Number.isFinite(a))return 0;
    a%=TAU;
    return a<=-Math.PI?a+TAU:a>Math.PI?a-TAU:a;
  }
  function lookAt(from,to,out){
    const dx=to[0]-from[0],dy=to[1]-from[1],dz=to[2]-from[2],h=Math.hypot(dx,dz);
    if(h!==0||dy!==0){out.yaw=Math.atan2(dx,-dz);out.pitch=Math.atan2(dy,h);}
    return out;
  }
  const usable=key=>typeof key==='string'&&key!==''&&key!=='__proto__';
  const quantize=(v,scale,max)=>{
    if(!Number.isFinite(v))return 0;
    const q=Math.round(v*scale);
    return q<-max?-max:q>max?max:q;
  };
  function schema(fields){
    if(!Array.isArray(fields)||!fields.length)fail('FDEMO_ARG','schéma : tableau de champs non vide attendu');
    const ops=[],copy=[],names=[],seen=new Map();let size=0;
    const claim=(key,index)=>{
      if(seen.has(key))fail('FDEMO_ARG','schéma : propriété '+key+' en double',{field:key,index});
      seen.set(key,index);names.push(key);
    };
    for(let i=0;i<fields.length;i++){
      const f=fields[i];
      if(!f||typeof f!=='object'||Array.isArray(f))fail('FDEMO_ARG','schéma : champ '+i+' : objet attendu',{index:i});
      const {name,type,scale,names:list}=f;
      if(!usable(name))fail('FDEMO_ARG','schéma : champ '+i+' : name attendu, chaîne non vide',{index:i});
      const bad=why=>fail('FDEMO_ARG','schéma : '+name+' : '+why,{field:name,index:i});
      const kind=type==='i8'?1:type==='i16'?2:type==='u8'?3:type==='u16'?4:type==='bits'?5:0,max=kind===1?127:kind===2?32767:0;
      if(!kind)bad('type inconnu');
      if(max&&!(Number.isFinite(scale)&&scale>0&&Number.isFinite(max/scale)))bad('scale attendu, nombre fini > 0');
      if(!max&&scale!==undefined)bad('scale interdit pour '+type);
      if(kind!==5&&list!==undefined)bad('names réservé au type bits');
      const op={kind,name,at:size,scale:max?scale:0,bias:max+1,names:null,count:0,pages:max?new Array(max+1>>7).fill(null):null};
      if(kind===5){
        if(!Array.isArray(list)||list.length<1||list.length>32)bad('names attendu, de 1 à 32 chaînes');
        op.names=[];
        for(let k=0;k<list.length;k++){
          const key=list[k];
          if(!usable(key))bad('nom de bit '+k+' vide ou invalide');
          claim(key,i);op.names.push(key);
        }
        op.count=list.length;size+=list.length+7>>3;
        copy.push({name,type,names:op.names.slice()});
      }else{
        claim(name,i);size+=kind===2||kind===4?2:1;
        copy.push(max?{name,type,scale}:{name,type});
      }
      ops.push(op);
    }
    function encode(input,view,offset){
      for(let i=0;i<ops.length;i++){
        const o=ops[i],at=offset+o.at;
        if(o.kind===1)view.setInt8(at,quantize(input[o.name],o.scale,127));
        else if(o.kind===2)view.setInt16(at,quantize(input[o.name],o.scale,32767),true);
        else if(o.kind===3){const v=input[o.name];view.setUint8(at,Number.isInteger(v)&&v>=0&&v<=254?v:255);}
        else if(o.kind===4){const v=input[o.name];view.setUint16(at,Number.isInteger(v)&&v>=0&&v<=65534?v:65535,true);}
        else for(let b=0,k=0;k<o.count;b++){
          let bits=0;
          for(let j=0;j<8&&k<o.count;j++,k++)if(input[o.names[k]])bits|=1<<j;
          view.setUint8(at+b,bits);
        }
      }
    }
    // Nombres déjà en boîte, par pages de 256 créées au premier usage : decode n'alloue plus ensuite.
    function decode(view,offset,out){
      for(let i=0;i<ops.length;i++){
        const o=ops[i],at=offset+o.at;
        if(o.kind<3){
          const q=o.kind===1?view.getInt8(at):view.getInt16(at,true),u=q+o.bias;
          const page=o.pages[u>>8]||(o.pages[u>>8]=new Array(256).fill(null));
          let v=page[u&255];
          if(v===null)v=page[u&255]=q/o.scale;
          out[o.name]=v;
        }else if(o.kind===3){const v=view.getUint8(at);out[o.name]=v===255?undefined:v;}
        else if(o.kind===4){const v=view.getUint16(at,true);out[o.name]=v===65535?undefined:v;}
        else for(let k=0;k<o.count;k++)out[o.names[k]]=(view.getUint8(at+(k>>3))>>(k&7)&1)===1;
      }
      return out;
    }
    return {fields:copy,size,names,encode,decode};
  }
  const NONE=Object.freeze([]);
  const text=(v,what)=>{try{return JSON.stringify(v);}catch{return fail('FDEMO_ARG',what+' : valeur hors JSON');}},json=(v,what)=>text(v,what)??'null';
  function ticker(perSecond){
    const pages=new Array(256).fill(null);
    return t=>{const page=pages[t>>8]||(pages[t>>8]=new Array(256).fill(null));return page[t&255]??(page[t&255]=t/perSecond);};
  }
  function settings(h,code,fill){
    if(!h||typeof h!=='object'||Array.isArray(h))fail(code,'en-tête : objet attendu');
    const s={gameVersion:'',engine:'',hz:60,dtTicks:0,checksumEvery:600},str=v=>typeof v==='string';
    for(const k of ['game','gameVersion','simHash','engine','hz','dtTicks','checksumEvery'])if(!fill||h[k]!==undefined)s[k]=h[k];
    const {game,simHash,hz,dtTicks:t,checksumEvery:c}=s,ok={game:str(game)&&game!=='',gameVersion:str(s.gameVersion),simHash:str(simHash)&&simHash!=='',
      engine:str(s.engine),hz:Number.isFinite(hz)&&hz>0&&1/hz<Infinity,dtTicks:Number.isInteger(t)&&t>=0&&t<=1e6,checksumEvery:Number.isSafeInteger(c)&&c>0};
    for(const k in ok)if(!ok[k])fail(code,'en-tête : '+k+' invalide',{field:k});
    try{s.sc=schema(h.fields);}catch(e){if(e&&e.code==='FDEMO_ARG')e.code=code;throw e;}
    return s;
  }
  function recorder(header,options={}){
    const {game,gameVersion,simHash,engine,hz,dtTicks,checksumEvery,sc}=settings(header,'FDEMO_ARG',true);
    const copy=(v,what)=>JSON.parse(json(v,what)),simVersion=copy(header.simVersion,'simVersion'),meta=copy(header.meta,'meta');
    const {maxBytes=4194304,initialSteps=3600}=options||fail('FDEMO_ARG','options : objet attendu');
    if(!(Number.isInteger(maxBytes)&&maxBytes>=0&&maxBytes<=2**30))fail('FDEMO_ARG','options : maxBytes invalide',{field:'maxBytes'});
    if(!(Number.isSafeInteger(initialSteps)&&initialSteps>=0))fail('FDEMO_ARG','options : initialSteps invalide',{field:'initialSteps'});
    const skip=dtTicks?2:0,R=sc.size+skip,tick=skip&&ticker(dtTicks),spare=new DataView(new ArrayBuffer(R)),out=sc.decode(spare,skip,{}),scenes=[];
    const grow=(bytes,n)=>{const next=new Uint8Array(Math.min(maxBytes,2*bytes.length+n));next.set(bytes);return next;};
    let records=new Uint8Array(Math.min(maxBytes,initialSteps*R)),view=new DataView(records.buffer),sums=new Uint8Array(512),sumView=new DataView(sums.buffer);
    let used=0,count=0,size=0,steps=0,taken=-1,dt=tick?0:1/hz,full=false,open=false,closed=false,now=null;
    const live=()=>{if(closed)fail('FDEMO_STATE','enregistreur fermé');},opened=what=>{live();if(!open)fail('FDEMO_STATE',what+' sans scène');};
    function room(n){if(!full&&size+n>maxBytes)full=now.truncated=true;return !full;}
    function step(input,seconds){
      opened('pas');
      if(!input||typeof input!=='object')fail('FDEMO_ARG','pas : entrée attendue');
      const store=room(R);
      if(store&&used+R>records.length){records=grow(records,R);view=new DataView(records.buffer);}
      const v=store?view:spare,at=store?used:0,t=tick&&(Number.isFinite(seconds)?Math.min(65535,Math.max(0,Math.round(seconds*dtTicks))):0);
      if(tick)v.setUint16(at,t,true);
      sc.encode(input,v,at+skip);sc.decode(v,at+skip,out);
      if(tick)dt=tick(t);
      if(store){used+=R;size+=R;now.steps++;}
      steps++;
      return out;
    }
    function build(){
      const head=utf8(JSON.stringify({format:FORMAT,game,gameVersion,simHash,simVersion,engine,hz,dtTicks,checksumEvery,fields:sc.fields,meta,
        scenes:scenes.map(s=>({info:s.info,steps:s.steps,checksums:s.checksums,commandBytes:s.commandBytes,truncated:s.truncated}))}));
      const all=new Uint8Array(8+head.length+size);
      let p=8+head.length;
      for(let i=0;i<4;i++)all[i]=MAGIC.charCodeAt(i);
      new DataView(all.buffer).setUint32(4,head.length,true);all.set(head,8);
      for(const s of scenes){
        all.set(records.subarray(s.at,s.at+s.steps*R),p);p+=s.steps*R;
        all.set(sums.subarray(s.sums,s.sums+8*s.checksums),p);p+=8*s.checksums;
        if(s.commandBytes)all.set(utf8('['+s.commands.join(',')+']'),p);
        p+=s.commandBytes;
      }
      return all;
    }
    return {
      scene(info){
        live();
        const copied=copy(info,'info');
        open=true;steps=0;taken=-1;if(tick)dt=0;
        if(!full)scenes.push(now={info:copied,steps:0,checksums:0,commandBytes:0,truncated:false,at:used,sums:8*count,commands:[]});
      },
      step,
      checksumDue(){live();return !full&&open&&steps%checksumEvery===0&&taken!==steps;},
      checksum(value){
        opened('empreinte');
        if(taken===steps)fail('FDEMO_STATE','deux empreintes au pas '+steps);
        taken=steps;
        if(!room(8))return;
        if(8*count+8>sums.length){sums=grow(sums,8);sumView=new DataView(sums.buffer);}
        sumView.setUint32(8*count,steps,true);sumView.setUint32(8*count+4,value>>>0,true);
        count++;size+=8;now.checksums++;
      },
      command(type,data=null){
        opened('commande');
        if(typeof type!=='string'||!type)fail('FDEMO_ARG','commande : type invalide');
        const line=json([steps,type,data],'commande '+type),cost=utf8(line).length+(now.commands.length?1:2);
        if(room(cost)){now.commands.push(line);now.commandBytes+=cost;size+=cost;}
      },
      bytes(){live();return build();},
      end(){live();closed=true;return build();},
      get input(){return out;},get dt(){return dt;},get steps(){return steps;},get size(){return size;},get full(){return full;}};
  }
  function player(bytes,expect){
    const view=ArrayBuffer.isView(bytes)?new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
      :Object.prototype.toString.call(bytes)==='[object ArrayBuffer]'?new DataView(bytes):fail('FDEMO_ARG','lecteur : octets attendus');
    const u8=new Uint8Array(view.buffer,view.byteOffset,view.byteLength),n=u8.length,bad=why=>fail('FDEMO_FORMAT','lecture : '+why);
    const read=(at,length,what)=>{try{return JSON.parse(fromUtf8(u8.subarray(at,at+length)));}catch{return bad(what+' illisible');}};
    if(n<8||String.fromCharCode(u8[0],u8[1],u8[2],u8[3])!==MAGIC)bad('signature '+MAGIC+' absente');
    const L=view.getUint32(4,true),header=L>n-8?bad('en-tête tronqué'):read(8,L,'en-tête');
    if(!header||header.format!==FORMAT)bad('format '+FORMAT+' attendu');
    const {hz,dtTicks,sc}=settings(header,'FDEMO_FORMAT'),list=header.scenes,R=sc.size+(dtTicks?2:0),parts=[];
    if(header.simVersion===undefined||header.meta===undefined||!Array.isArray(list))bad('en-tête incomplet');
    function commandsOf(part,k){
      if(!part.commandBytes)return NONE;
      const all=read(part.commands,part.commandBytes,'commandes de la scène '+k);
      if(!Array.isArray(all)||!all.length)bad('commandes de la scène '+k+' vides');
      let last=0;
      for(const c of all){
        if(!Array.isArray(c)||c.length!==3||!Number.isSafeInteger(c[0])||c[0]<last||c[0]>part.steps||typeof c[1]!=='string'||!c[1])bad('commande invalide, scène '+k);
        last=c[0];
      }
      return all;
    }
    let p=8+L;
    for(let k=0;k<list.length;k++){
      const s=list[k]||{},{steps,checksums,commandBytes}=s,sums=p+steps*R,commands=sums+checksums*8;
      if(s.info===undefined||typeof s.truncated!=='boolean'||![steps,checksums,commandBytes].every(v=>Number.isSafeInteger(v)&&v>=0))bad('scène '+k+' invalide');
      if(steps*R>n-p||checksums*8>n-sums||commandBytes>n-commands)bad('scène '+k+' tronquée');
      for(let i=0,last=-1;i<checksums;i++){
        const at=view.getUint32(sums+8*i,true);
        if(at<=last||at>steps)bad('scène '+k+' : empreintes hors ordre');
        last=at;
      }
      const part={at:p,steps,sums,checksums,commands,commandBytes};
      commandsOf(part,k);parts.push(part);p=commands+commandBytes;
    }
    if(p!==n)bad(n+' octets au lieu de '+p);
    if(expect!==undefined&&expect!==null){
      if(typeof expect!=='object')fail('FDEMO_ARG','lecteur : expect invalide');
      for(const key of Object.keys(expect))if(text(header[key],'expect')!==text(expect[key],'expect'))fail('FDEMO_MISMATCH','enregistrement refusé : '+key,{field:key});
    }
    const fixed=dtTicks?0:1/hz,tick=dtTicks&&ticker(dtTicks);
    let scene=0,base=0,count=0,cursor=0,dt=fixed,commands=new Map(),sums=new Map(),divergence=null;
    const play={header,sceneCount:parts.length,
      select(k){
        const part=Number.isInteger(k)&&parts[k]||fail('FDEMO_ARG','lecteur : scène '+k+' inexistante'),byStep=new Map(),expected=new Map();
        for(const [at,type,data] of commandsOf(part,k))(byStep.get(at)||byStep.set(at,[]).get(at)).push({type,data});
        for(let i=0;i<part.checksums;i++)expected.set(view.getUint32(part.sums+8*i,true),view.getUint32(part.sums+8*i+4,true));
        scene=k;base=part.at;count=part.steps;cursor=0;dt=fixed;commands=byStep;sums=expected;
        return play;
      },
      next(out){
        if(cursor>=count)return false;
        let at=base+cursor*R;
        if(tick){dt=tick(view.getUint16(at,true));at+=2;}
        sc.decode(view,at,out);cursor++;
        return true;
      },
      commandsAt:at=>commands.get(at)||NONE,
      expected:at=>sums.get(at),
      verify(at,value){
        const want=sums.get(at);
        if(want===undefined||want===value>>>0)return true;
        divergence=divergence||{scene,step:at,expected:want,actual:value>>>0};
        return false;
      },
      get scene(){return scene;},get steps(){return count;},get step(){return cursor;},get dt(){return dt;},get divergence(){return divergence;}};
    if(parts.length)play.select(0);
    return play;
  }
  function replay(bytes,game,options){
    const {expect,stopOnDesync=true}=options??{};
    if(!game||typeof game.open!=='function'||typeof stopOnDesync!=='boolean')fail('FDEMO_ARG','rejeu : game.open ou stopOnDesync invalide');
    const play=player(bytes,expect),header=play.header,input={},result={ok:true,steps:0,checked:0,divergence:null,scenes:[]};
    let k=0,h=null,part=null,done=false,busy=false;
    const close=()=>{const x=h;h=null;if(typeof x.dispose==='function')x.dispose();};
    function check(at){
      const want=play.expected(at);
      if(want===undefined)return true;
      const actual=h.checksum()>>>0;
      result.checked++;part.checked++;
      if(actual===want)return true;
      const d={scene:k,step:at,expected:want,actual};
      part.divergence=part.divergence||d;
      if(result.ok){result.ok=false;result.divergence=d;}
      return !stopOnDesync;
    }
    function advance(max=Infinity){
      if(!(max>=0&&(Number.isInteger(max)||max===Infinity)))fail('FDEMO_ARG','rejeu : maxSteps invalide');
      if(busy)fail('FDEMO_STATE','rejeu : advance imbriqué');
      busy=true;
      try{
        for(let taken=0;!done;){
          if(!h){
            if(k>=play.sceneCount){done=true;break;}
            if(taken>=max)break;
            play.select(k);result.scenes.push(part={index:k,steps:0,checked:0,divergence:null});
            h=game.open(header.scenes[k].info,k,header);
            if(!h||typeof h.step!=='function'||typeof h.checksum!=='function')fail('FDEMO_ARG','rejeu : poignée invalide, scène '+k);
            if(!check(0)){close();done=true;break;}
          }
          if(play.step<play.steps&&taken>=max)break;
          const list=play.commandsAt(play.step);
          if(list.length&&typeof h.command!=='function')fail('FDEMO_COMMAND','rejeu : commande '+list[0].type+' sans h.command');
          for(let i=0;i<list.length;i++)h.command(list[i].type,list[i].data);
          if(!play.next(input)){close();k++;continue;}
          h.step(input,play.dt);
          taken++;result.steps++;part.steps++;
          if(!check(play.step)){close();done=true;}
        }
      }catch(e){done=true;if(h)try{close();}catch{}throw e;}
      finally{busy=false;}
      return done;
    }
    return {advance,run(){advance();return result;},get done(){return done;},get result(){return result;}};
  }
  // Réalisateur : temps simulé, tirages dans l'ordre plan, cible si needs, durée.
  const START={shot:null,target:null,changed:false,cut:false,flying:false,reason:null,age:0,hold:0,flight:0};
  function director(options){
    const ok=Number.isFinite,bad=why=>fail('FDEMO_ARG','réalisateur : '+why);
    const {seed=1,shots,fov=74,fly,avoid}=options||bad('options attendues'),{base=1.8,speed=160,min:low=2.2,max:high=5.5}=fly||{},{count=2,radius=12,factor=.3}=avoid||{};
    if(![seed,fov,base,speed,low,high,radius,factor].every(ok)||!(Number.isInteger(count)&&count>=0&&count<=16))bad('options invalides');
    const ids=new Set(),plans=(Array.isArray(shots)&&shots.length?shots:bad('plans attendus')).map((s,i)=>{
      const {id,duration:d,transition='cut'}=s||{};
      if(typeof id!=='string'||!id||ids.has(id)||!(Array.isArray(d)&&ok(d[0])&&ok(d[1])&&d[0]>0&&d[0]<=d[1])||typeof s.pose!=='function'||transition!=='cut'&&transition!=='fly')bad('plan '+i+' invalide');
      ids.add(id);return {...s,min:d[0],max:d[1],fly:transition==='fly'};
    });
    const n=plans.length,draw=rng(seed),weights=new Float64Array(n),ring=new Float64Array(3*count),blank=()=>({pos:[0,0,0],yaw:0,pitch:0,roll:0,fov});
    const live=blank(),from=blank(),own=live.pos,frame={...START,pose:blank()},out=frame.pose;
    let spots=new Float64Array(8),cur,prev,aim,why,cutting,shown,stored,slot;
    const copy=(a,b)=>{const p=a.pos,q=b.pos;p[0]=q[0];p[1]=q[1];p[2]=q[2];a.yaw=b.yaw;a.pitch=b.pitch;a.roll=b.roll;a.fov=b.fov;};
    const mix=(a,b,k)=>a+(b-a)*k,worth=p=>{const w=p.weight===undefined?1:p.weight;return ok(w)&&w>0?w:0;};
    const seek=(list,key,kind)=>{for(let j=0;j<list.length;j++){const p=list[j];if(p&&(kind?p.kind===key&&worth(p)>0:p.id===key))return p;}return null;};
    function choose(ctx,list){
      let positive=0;
      for(let i=0;i<n;i++){
        const s=plans[i],w=typeof s.weight==='function'?s.weight(ctx):s.weight;
        if((weights[i]=ok(w)&&w>0&&(!s.valid||s.valid(ctx))&&(s.needs===undefined||seek(list,s.needs,1))?w:0)>0)positive++;
      }
      if(positive>1&&prev>=0)weights[prev]=0;
      const i=draw.pick(weights,n),s=plans[i];
      if(i<0)return false;
      prev=i;frame.target=null;
      if(s.needs!==undefined){
        if(spots.length<list.length)spots=new Float64Array(list.length);
        for(let j=0;j<list.length;j++){
          const p=list[j];let w=p&&p.kind===s.needs?worth(p):0;
          for(let k=0;w>0&&k<3*stored;k+=3){const q=p.pos,x=q[0]-ring[k],y=q[1]-ring[k+1],z=q[2]-ring[k+2];if(x*x+y*y+z*z<radius*radius){w*=factor;break;}}
          spots[j]=w;
        }
        const t=frame.target=list[draw.pick(spots,list.length)];
        if(!t)return false;
        aim=t.id;
        if(count){const q=t.pos,k=3*slot;ring[k]=q[0];ring[k+1]=q[1];ring[k+2]=q[2];slot=(slot+1)%count;stored=Math.min(stored+1,count);}
      }
      frame.hold=draw.range(s.min,s.max);frame.age=frame.flight=0;cur=i;
      return true;
    }
    function update(dt,ctx){
      dt=ok(dt)&&dt>0?dt:0;
      const list=ctx&&Array.isArray(ctx.points)?ctx.points:NONE,p=out.pos,f=from.pos;
      frame.changed=frame.cut=false;
      if(cutting){cutting=false;cur=-1;why='external';}
      else if(cur>=0){
        const s=plans[cur],age=frame.age+=dt,t=s.needs===undefined?null:seek(list,aim);
        const end=s.needs!==undefined&&!t?'lost':s.valid&&!s.valid(ctx)?'invalid':age>=frame.flight+frame.hold?'time':s.cutIf&&age>=frame.flight&&s.cutIf(ctx,age,t)?'cutIf':'';
        if(end){cur=-1;why=end;}else frame.target=t;
      }
      for(let tries=0;tries<n;tries++){
        const fresh=cur<0;
        if(fresh&&!choose(ctx,list))break;
        const s=plans[cur],age=frame.age;
        live.pos=own;live.roll=0;live.fov=fov;s.pose(ctx,age,frame.target,live);
        const q=live.pos;
        if(!(q&&ok(q[0])&&ok(q[1])&&ok(q[2])&&ok(live.yaw)&&ok(live.pitch)&&ok(live.roll)&&ok(live.fov))){cur=-1;why='pose';continue;}
        if(fresh){
          const x=q[0]-p[0],y=q[1]-p[1],z=q[2]-p[2],span=s.fly&&shown?Math.min(high,Math.max(low,base+Math.sqrt(x*x+y*y+z*z)/speed)):0;
          frame.flight=span>0?span:0;frame.changed=true;if(!(frame.cut=!frame.flight))copy(from,out);
        }
        if(frame.flying=age<frame.flight){
          const k=smootherstep(age/frame.flight);
          for(let i=0;i<3;i++)p[i]=mix(f[i],q[i],k);
          out.yaw=from.yaw+wrapAngle(live.yaw-from.yaw)*k;out.pitch=mix(from.pitch,live.pitch,k);out.roll=mix(from.roll,live.roll,k);out.fov=mix(from.fov,live.fov,k);
        }else copy(out,live);
        shown=true;break;
      }
      if(cur<0)Object.assign(frame,START);else frame.shot=plans[cur].id;
      frame.reason=why;
      return frame;
    }
    function reset(s=seed){
      if(!ok(s))bad('graine invalide');
      draw.state=s;cur=prev=-1;why='start';cutting=shown=false;stored=slot=0;Object.assign(frame,START);live.pos=own;
      for(const o of [live,from,out])copy(o,blank());
    }
    reset();
    return {frame,update,reset,cut(){cutting=true;shown=false;stored=slot=0;}};
  }
  // Independent title-screen lifecycle; no game globals, saving or simulation.
  function attract(o={}){
    const win=o.window||G,doc=o.document||win.document,now=o.now||(()=>performance.now()),read=v=>typeof v==='function'?v():v;
    let state='idle',since=now(),swallowUntil=0,disposed=false,serial=0,padDown=false,consumePad=false,hiddenAt=null;
    const mute=e=>{e?.preventDefault?.();e?.stopImmediatePropagation?.();e?.stopPropagation?.();};
    function stop(reason='gesture'){
      const live=state==='running'||state==='starting';serial++;state='idle';since=now();if(live){swallowUntil=since+(o.swallowMs??600);o.stop?.(reason);}return live;
    }
    function poke(e){
      if(disposed)return;const key=e?.code||e?.key||'',modifier=/^(Shift|Control|Alt|Meta|CapsLock)/.test(key),browser=!!(e?.ctrlKey||e?.metaKey||e?.altKey||/^F\d{1,2}$/.test(key));
      if(modifier)return;if(now()<swallowUntil&&!browser){mute(e);return;}
      if(stop('gesture')){if(!e)consumePad=true;if(!browser)mute(e);}since=now();
    }
    const listeners=['pointerdown','keydown','wheel','touchstart','click','pointerup'];for(const name of listeners)win.addEventListener?.(name,poke,{capture:true,passive:false});
    function tick(){
      if(disposed)return;const t=now();let down=false;try{for(const p of win.navigator?.getGamepads?.()||[])if(p?.connected&&(p.buttons?.some(b=>b.pressed||b.value>.5)||p.axes?.some(a=>Math.abs(a)>.5)))down=true;}catch{}
      if(down&&!padDown)poke();padDown=down;if(!down)consumePad=false;
      if(doc?.hidden){if(hiddenAt===null){hiddenAt=t;o.onPause?.();}since=t;return;}if(hiddenAt!==null){const elapsed=t-hiddenAt;hiddenAt=null;o.onResume?.(elapsed);since=t;}
      if(state==='starting'||state==='running')return;
      if(down||read(o.enabled)===false||read(o.canStart)===false||win.matchMedia?.('(prefers-reduced-motion: reduce)').matches){state='idle';since=t;o.onCountdown?.(null);return;}
      state='armed';const left=Math.max(0,(read(o.idleMs)??5000)-(t-since));o.onCountdown?.(left);if(left>0)return;
      state='starting';const ticket=++serial;
      try{const work=o.start?.();if(work&&typeof work.then==='function')work.then(ok=>{if(!disposed&&ticket===serial){state=ok===false?'idle':'running';since=now();}}).catch(error=>{if(ticket===serial){stop('error');o.onError?.(error);}});else{state=work===false?'idle':'running';since=t;}}
      catch(error){stop('error');o.onError?.(error);}
    }
    return {tick,poke,stop,get state(){return state;},get swallowing(){return consumePad||now()<swallowUntil;},dispose(){if(disposed)return;stop('dispose');disposed=true;for(const name of listeners)win.removeEventListener?.(name,poke,true);}};
  }
  function runner(o={}){
    const scenes=o.scenes||[];if(!scenes.length)throw Error('Demo scenes required');let at=-1,current=null,age=0,stalled=0,key='',recoveries=0,disposed=false,errors=[],time=0,opening=0;
    const stats={scenes:0,steps:0,deaths:0,stalls:0,errors:0,seconds:0};
    function next(reason='next'){
      if(disposed)return;current?.dispose?.();current=null;age=stalled=0;recoveries=0;key='';at=(at+1)%scenes.length;const ticket=++opening;
      try{const result=o.open(scenes[at],reason);const accept=value=>{if(disposed||ticket!==opening){value?.dispose?.();return;}current=value;stats.scenes++;o.onScene?.(scenes[at],reason);};if(result?.then)result.then(accept).catch(error=>{if(ticket===opening&&!disposed)fail(error);});else accept(result);}catch(error){fail(error);}
    }
    function fail(error){stats.errors++;errors=errors.filter(t=>time-t<60);errors.push(time);o.onError?.(error);if(errors.length>=3){dispose();o.onStop?.('errors');}else next('error');}
    function step(dt){
      if(disposed||!current||!(dt>0))return;
      try{current.step(dt);time+=dt;age+=dt;stats.steps++;stats.seconds+=dt;const value=String(current.progressKey?.()??'');if(value!==key){key=value;stalled=0;}else stalled+=dt;
        if(current.dead?.()){stats.deaths++;if(recoveries++<2&&current.recover?.()){stalled=0;return;}next('death');return;}
        if(current.done?.()||age>=(scenes[at].maxSeconds||o.sceneSeconds||240)){next('end');return;}
        if(stalled>=(o.stallSeconds||50)){stats.stalls++;if(recoveries++===0){current.reset?.();stalled=0;}else next('stall');}
      }catch(error){fail(error);}
    }
    function dispose(){if(disposed)return;disposed=true;opening++;current?.dispose?.();current=null;}
    return {step,next,dispose,stats,get scene(){return scenes[at];},get waiting(){return !current;},get stopped(){return disposed;}};
  }
  G.FDemo={FORMAT,MAGIC,rng,hasher,seedFor,smootherstep,wrapAngle,lookAt,schema,recorder,player,replay,director,attract,runner};
})(typeof window!=='undefined'?window:globalThis);
