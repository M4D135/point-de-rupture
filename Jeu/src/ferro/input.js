/* FERRO input. Contract: docs/chantier-moteur/modules/entrees.md */
(function(G){
'use strict';
const PAD_BUTTONS=Object.freeze(['A','B','X','Y','LB','RB','LT','RT','Back','Start','L3','R3','Up','Down','Left','Right','Home']);
const TUNE={sensitivity:[1,.25,3],invertY:[false],padYaw:[300,60,600],padPitch:[190,40,400],padDead:[.12,0,.4],moveDead:[.15,0,.4],padCurve:[1.7,1,3],padBoost:[.8,0,1.5],padInvertY:[false],padVibration:[1,0,1],swapSticks:[false],touchAccel:[1,0,1],touchPitch:[1,.5,1.5],stickRadius:[56,32,96]};
for(const k in TUNE)Object.freeze(TUNE[k]);Object.freeze(TUNE);
const K={outer:.97,boostAt:.97,boostAfter:.18,boostRamp:.30,trigOn:.30,trigOff:.18,valueDead:.05,padRun:.92,activeAxis:.3,navAxis:.5,navDelay:.40,navRepeat:.12,touchDead:.12,follow:1.6,runOn:1.25,runOff:1.05,touchRad:.004,v0:400,v1:2200,accel:2.2,slop:4,compatMs:800,rumbleGap:40,dtMax:.25,tdtMin:.008,tdtMax:.05};
const allowKey=code=>typeof code==='string'&&/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Space|Enter|Backspace|Tab)$/.test(code);
const NAMES={Space:'Espace',Enter:'Entrée',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',ShiftLeft:'Maj G',ShiftRight:'Maj D',ControlLeft:'Ctrl G',ControlRight:'Ctrl D',Backspace:'Retour',Tab:'Tab'};
const GLYPHS={xbox:{Back:'Vue',Start:'Menu',L3:'LS',R3:'RS',Home:'Xbox'},ps:{A:'✕',B:'○',X:'□',Y:'△',LB:'L1',RB:'R1',LT:'L2',RT:'R2',Back:'Create',Start:'Options',Home:'PS'}};
const DEVICES=['keyboard','mouse','touch','gamepad'],own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const need=(ok,what)=>{if(!ok)throw new Error('FInput : '+what+'.');},padOk=name=>name!=='Home'&&PAD_BUTTONS.includes(name),letter=c=>typeof c==='string'&&/^Key/.test(c);
const fin=v=>Number.isFinite(v)?v:0,copy=o=>JSON.parse(JSON.stringify(o)),clamp=(v,hi)=>Math.min(hi,Math.max(0,v))||0;
function keyName(code){return own(NAMES,code)?NAMES[code]:String(code).replace(/^(Key|Digit)/,'');}
function compile(config){
need(isObj(config),'config invalide');
const allow=config.allowKey===undefined?allowKey:config.allowKey,list=config.actions,actions=[],index=new Map(),owner=new Map();
need(typeof allow==='function','allowKey invalide');need(Array.isArray(list)&&list.length>0,'actions invalides');
const isKey=c=>typeof c==='string'&&!!allow(c),text=v=>v===undefined||typeof v==='string';
const codes=(id,v,max,ok,dev)=>{const r=v===undefined?[]:v;need(Array.isArray(r)&&r.length<=max&&r.every(ok),(dev==='k'?'touches':'boutons')+' invalides pour '+id);for(const c of r){need(!owner.has(dev+c),c+' déjà affecté à '+owner.get(dev+c));owner.set(dev+c,id);}return r.slice();};
for(const a of list){
const id=isObj(a)?a.id:undefined;
need(typeof id==='string'&&/^[A-Za-z][A-Za-z0-9]*$/.test(id),'id invalide : '+String(id));need(!index.has(id),'id en double : '+id);need(a.type==='hold'||a.type==='press'||a.type==='value','type inconnu pour '+id);
const label=a.label===undefined?id:a.label;
need(typeof label==='string'&&text(a.touch)&&text(a.mouse),'libellé invalide pour '+id);need(a.alt===undefined||Array.isArray(a.alt)&&a.alt.every(isKey),'repli invalide pour '+id);
actions.push({id,label,type:a.type,keys:codes(id,a.keys,3,isKey,'k'),pad:codes(id,a.pad,2,padOk,'p'),touch:a.touch,mouse:a.mouse,alt:a.alt?a.alt.slice():[]});index.set(id,actions.length-1);
}
const held=id=>index.has(id)&&actions[index.get(id)].type==='hold',decl=config.sticks===undefined?{}:config.sticks,sticks=[];
need(isObj(decl),'sticks invalides');
for(const name of Object.keys(decl)){
const s=decl[name],w='stick '+name;
need(/^[a-z][A-Za-z0-9]*$/.test(name)&&!index.has(name+'X')&&!index.has(name+'Y'),'nom de stick invalide : '+name);need(isObj(s)&&(s.type==='move'||s.type==='look')&&!sticks.some(t=>t.type===s.type),w+' : type invalide ou en double');
const axis=v=>{const r=v===undefined?[]:v;need(Array.isArray(r)&&(r.length===0||r.length===2)&&r.every(held),w+' : axe invalide');return r.slice();},x=axis(s.x),y=axis(s.y);
need(new Set(x.concat(y)).size===x.length+y.length,w+' : action en double');need(s.pad===undefined||(s.pad==='LS'||s.pad==='RS')&&!sticks.some(t=>t.pad===s.pad),w+' : pad invalide');
need(s.run===undefined||s.type==='move'&&held(s.run),w+' : run invalide');need(s.rate===undefined||s.type==='look'&&Number.isFinite(s.rate)&&s.rate>0,w+' : rate invalide');
sticks.push({name,type:s.type,x,y,pad:s.pad||null,run:s.run===undefined?null:s.run,rate:s.rate===undefined?2:s.rate});
}
const version=config.version===undefined?1:config.version,device=config.device===undefined?'keyboard':config.device,mouseScale=config.mouseScale===undefined?.0022:config.mouseScale;
need(Number.isInteger(version)&&version>=1,'version invalide');need(DEVICES.includes(device),'appareil invalide : '+String(device));need(Number.isFinite(mouseScale),'mouseScale invalide');
need(config.getGamepads===undefined||typeof config.getGamepads==='function','getGamepads invalide');
return {actions,index,sticks,version,device,mouseScale,isKey,getGamepads:config.getGamepads||null,migrate:typeof config.migrate==='function'?config.migrate:null,settings:config.settings,one:config.singlePad===true,menu:config.menu===true,moveCurve:config.moveCurve===true,release:config.releaseAfterClear===true};
}
function radial(x,y,inner,outer){const m=Math.hypot(x,y),n=Math.min(1,(m-inner)/(outer-inner));return m>inner?[x/m*n||0,y/m*n||0,n]:[0,0,0];}
function padStyle(id){return /054c|playstation|dualshock|dualsense|sony/i.test(id)?'ps':/045e|xbox|xinput/i.test(id)?'xbox':'generic';}
function glyph(name,style){const g=own(GLYPHS,style)?GLYPHS[style]:{},a='Arrow'+name;return own(g,name)?g[name]:own(NAMES,a)?NAMES[a]:name;}
function initial(C){const s={v:C.version,keys:{},pad:{},tune:{}};for(const a of C.actions){s.keys[a.id]=a.keys.slice();s.pad[a.id]=a.pad.slice();}for(const k in TUNE)s.tune[k]=TUNE[k][0];return s;}
function table(t,C,f,max,ok){
if(!isObj(t))return null;
const used=new Set(),out={},free=c=>!used.has(c);
for(const a of C.actions)if(own(t,a.id)){const v=t[a.id];if(!Array.isArray(v)||v.length>max||!v.every(c=>ok(c)&&free(c)&&used.add(c)))return null;}
for(const a of C.actions){let v=t[a.id];if(!own(t,a.id)){v=a[f].filter(free);if(!v.length&&f==='keys')v=a.alt.filter(free).slice(0,1);for(const c of v)used.add(c);}out[a.id]=v;}
return out;
}
function settle(raw,C){
let r={};if(isObj(raw))try{r=copy(raw);}catch(e){}if(!isObj(r))r={};
const from=Number.isInteger(r.v)?r.v:0,{migrate}=C;
if(from<C.version&&migrate)try{const m=copy(migrate(copy(r),from));if(isObj(m))r=m;}catch(e){}
const s=initial(C),t=isObj(r.tune)?r.tune:{};s.keys=table(r.keys,C,'keys',3,C.isKey)||s.keys;s.pad=table(r.pad,C,'pad',2,padOk)||s.pad;
for(const k in TUNE){const [d,lo,hi]=TUNE[k],v=own(t,k)?t[k]:d;s.tune[k]=lo===undefined?typeof v==='boolean'?v:d:Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):d;}
return s;
}
function rebind(C,settings,device,action,code,none){
const kb=device==='keyboard',f=kb?'keys':'pad',no=reason=>({ok:false,reason});
if(!kb&&device!=='gamepad')return no('Appareil inconnu.');
if(!C.index.has(action))return no('Action inconnue.');
if(!none&&!(kb?C.isKey(code):padOk(code)))return no(kb?'Cette touche est réservée au navigateur.':code==='Home'?'Ce bouton est réservé au système.':'Bouton inconnu.');
const s=settle(settings,C),other=none?null:C.actions.find(a=>a.id!==action&&s[f][a.id].includes(code));
if(other)return {ok:false,conflict:other.id,reason:'Déjà utilisé'+(kb?'e':'')+' : '+other.label+'.'};
s[f][action]=none?[]:[code];return {ok:true,settings:s};
}
function defaults(config){return initial(compile(config));}
function normalize(raw,config){return settle(raw,compile(config));}
function assign(config,settings,device,action,code){return rebind(compile(config),settings,device,action,code);}
function unbind(config,settings,device,action){return rebind(compile(config),settings,device,action,null,true);}
function guessDevice(win=G){try{const m=q=>win.matchMedia(q).matches;return m('(pointer: coarse)')||win.navigator?.maxTouchPoints>0&&m('(hover: none)')?'touch':'keyboard';}catch(e){return 'keyboard';}}
function focusMove(R,c,D=G.document){
if(!R||!D)return null;
const es=Array.from(R.querySelectorAll?.('button,input,select,a[href],[tabindex]')||[]).filter(e=>!e.disabled&&!e.closest?.('[hidden]')&&e.getClientRects?.().length&&e.getAttribute?.('aria-hidden')!=='true');
if(!es.length)return null;
let at=es.indexOf(D.activeElement),el=es[at];
const E=(e,type)=>e.dispatchEvent?.(new G.Event(type,{bubbles:true}));
if(el&&(c==='decrease'||c==='increase'||(c==='left'||c==='right')&&el.type==='range')){
const n=c==='decrease'||c==='left'?-1:1;
if(el.type==='range'){
const lo=Number(el.min)||0,hi=el.max===''?100:Number(el.max),step=Number(el.step)||1,v=Number(el.value)||0;
el.value=String(Math.min(hi,Math.max(lo,Math.round((v+n*step)*1e9)/1e9)));E(el,'input');return el;
}
if(el.tagName==='SELECT'){
const os=Array.from(el.options||[]).filter(o=>!o.disabled),index=os.findIndex(o=>o.value===el.value);
if(os.length){el.value=os[Math.max(0,Math.min(os.length-1,index+n))].value;E(el,'change');}return el;
}
}
if(c==='accept'){
if(el){if(el.tagName==='SELECT')return focusMove(R,'increase',D);el.click?.();return el;}
at=0;
}else if(['up','left','down','right'].includes(c))at=at<0?0:(at+(c==='up'||c==='left'?-1:1)+es.length)%es.length;
else if(at<0)at=0;
el=es[at];el.focus?.({preventScroll:true});el.scrollIntoView?.({block:'nearest'});return el;
}
function create(config){
const C=compile(config),held=new Set(),pressed=[],learnt=new Map(),rumbling=new Set(),acts=new WeakMap(),blocked=new Set();
const A=C.actions.map(a=>({a,k:0,m:false,t:0,g:false,gr:false,tr:false,gv:0,latch:false,edge:false})),at=id=>A[C.index.get(id)];
const sticks=C.sticks.map(s=>({kx:s.name+'X',ky:s.name+'Y',move:s.type==='move',x:s.x.map(at),y:s.y.map(at),rate:s.rate,pad:s.pad,run:s.run&&at(s.run)})),look=sticks.find(s=>!s.move),walk=sticks.find(s=>s.move);
let S,codes,lay=null,lp=null,rt=-Infinity,dev=C.device,shown=dev,touchT=-Infinity,px=0,py=0,pmx=0,pmy=0,tmx=0,tmy=0,cap=null,got=null,seen=new Map(),gp=new Map(),pb=[],hold=0,quiet=false,block=false,navKey='',nh=0,nd=0;
const trig=[false,false],on=s=>s.k>0||s.m||s.t>0||s.g||s.gr||s.tr,axis=v=>v.length?Number(on(v[1]))-Number(on(v[0])):0;
const rise=(s,was,pad)=>{if(!was&&on(s)&&!(pad&&quiet)){s.latch=true;if(!s.edge){s.edge=true;pressed.push(s.a.id);}}},mouse=t=>{if(!(t-touchT<K.compatMs))dev='mouse';};
const keyLabel=code=>{if(letter(code)){if(learnt.has(code))return learnt.get(code);const v=lay&&(typeof lay.get==='function'?lay.get(code):lay[code]);if(typeof v==='string'&&v)return [...v].length>1?v:v.toUpperCase();}return keyName(code);};
const list=(v,f)=>v.length?v.map(f).join(' / '):'—';
function configure(raw){S=settle(raw,C);codes=new Map();for(const s of A){s.k=0;for(const c of S.keys[s.a.id]){codes.set(c,s);if(held.has(c))s.k++;}s.pi=S.pad[s.a.id].map(n=>PAD_BUTTONS.indexOf(n));s.g=s.pi.some(j=>pb[j]);}return copy(S);}
configure(C.settings);
return {
keyDown(code,t,repeat,key){
dev='keyboard';if(letter(code)&&typeof key==='string'&&/^[^\s\p{C}]$/u.test(key))learnt.set(code,key.toUpperCase());
if(cap==='keyboard'){if(!repeat&&typeof code==='string'){got={device:'keyboard',code};cap=null;}return true;}
const s=codes.get(code);if(typeof code==='string'&&!held.has(code)){held.add(code);if(s){const was=on(s);s.k++;if(!repeat)rise(s,was);}}return !!s;
},
keyUp(code){const s=codes.get(code);if(held.delete(code)&&s)s.k--;return !!s;},
mouseMove(dx,dy,t){const T=S.tune;px+=fin(dx)*C.mouseScale*T.sensitivity;py-=fin(dy)*C.mouseScale*T.sensitivity*(T.invertY?-1:1);mouse(t);},
button(id,down,t,device){
const s=at(id);if(!s||device!=='mouse'&&device!=='touch')return false;
const was=on(s);if(device==='mouse'){s.m=!!down;mouse(t);}else{s.t=down?s.t+1:Math.max(0,s.t-1);dev='touch';touchT=t;}rise(s,was);return true;
},
addLook(x,y,device){px+=fin(x);py+=fin(y);if(DEVICES.includes(device))dev=device;},
clear(){for(const a of rumbling){try{const r=typeof a.reset==='function'?a.reset():typeof a.playEffect==='function'?a.playEffect('dual-rumble',{startDelay:0,duration:1,weakMagnitude:0,strongMagnitude:0}):a.pulse(0,0);if(typeof r?.catch==='function')r.catch(()=>{});}catch(e){}}rumbling.clear();held.clear();for(const s of A){s.k=s.t=s.gv=0;s.m=s.g=s.gr=s.tr=s.latch=s.edge=false;}pressed.length=0;px=py=pmx=pmy=tmx=tmy=hold=0;cap=got=null;quiet=true;block=C.release;navKey='';nh=nd=0;},
configure,get settings(){return copy(S);},get device(){return dev;},
assign:(device,action,code)=>rebind(C,S,device,action,code),
unbind:(device,action)=>rebind(C,S,device,action,null,true),
capture(device){cap=device==='keyboard'||device==='gamepad'?device:null;got=null;},
keyLabel,setLayout(map){lay=isObj(map)?map:null;},
label(id,device=dev){
const s=at(id);if(!s)return '?';
const a=s.a;return device==='gamepad'?list(S.pad[id],n=>glyph(n,lp?.style||'generic')):device==='touch'?a.touch??a.label:device==='mouse'&&a.mouse!==undefined?a.mouse:list(S.keys[id],keyLabel);
},
rumble(strong,weak,ms,t){
const v=S.tune.padVibration;if(v<=0||t-rt<K.rumbleGap)return false;
try{const card=gp.has(lp)?lp:gp.keys().next().value,p=gp.get(card);if(!card)return false;if(!C.one||!acts.has(card))acts.set(card,p.vibrationActuator||p.hapticActuators?.[0]||null);const a=acts.get(card);if(!a)return false;
const strongMagnitude=clamp(strong,1)*v,weakMagnitude=clamp(weak,1)*v,duration=clamp(ms,5000),r=typeof a.playEffect==='function'?a.playEffect('dual-rumble',{startDelay:0,duration,weakMagnitude,strongMagnitude}):a.pulse(Math.max(strongMagnitude,weakMagnitude),duration);rumbling.add(a);if(typeof r?.catch==='function')r.catch(()=>{});
}catch(e){return false;}
rt=t;return true;
},
frame(dt,ctx){
dt=Number.isFinite(dt)?Math.min(K.dtMax,Math.max(0,dt)):0;
const T=S.tune,sc=Number.isFinite(ctx?.lookScale)?ctx.lookScale:1,now=new Map(),P=new Map(),con=[],dis=[],b=[],tv=[0,0],card=o=>({...o});
const side=s=>s&&s.pad?s.pad==='LS'!==T.swapSticks?0:2:-1,ms=side(walk),ls=side(look);
let L=[],fa=null,mv=[0,0,0],lk=mv,navX=0,navY=0;
try{L=Array.from((C.getGamepads?C.getGamepads():G.navigator.getGamepads())||[]);}catch(e){}
const first=C.one?L.filter(p=>p&&typeof p==='object'&&p.connected!==false).sort((a,b)=>(a.index||0)-(b.index||0))[0]:null;
L.forEach((p,i)=>{
if(!p||typeof p!=='object'||p.connected===false)return;
const id=String(p.id??''),index=p.index??i,key=index+':'+id,ax=j=>fin((p.axes||[])[j]),bt=p.buttons||[];
const o=now.get(key)||seen.get(key)||{index,id,style:padStyle(id),standard:p.mapping==='standard'};
if(!now.has(key)){if(!seen.has(key))con.push(card(o));now.set(key,o);P.set(o,p);}
if(C.one&&p!==first)return;
if(C.one)lp=o;
let act=false;
for(let j=0;j<17;j++){const q=bt[j]||0,v=fin(q.value??q),d=!!q.pressed;act=act||d||v>K.activeAxis;if(j===6||j===7)tv[j-6]=Math.max(tv[j-6],v);else b[j]=b[j]||d||v>.5;}
for(let j=0;j<4;j++)act=act||Math.abs(ax(j))>K.activeAxis;
if(act&&!(fa&&fa.index<=index))fa=o;
const r=(o,dz,w)=>{const v=o<0?w:radial(ax(o),ax(o+1),dz,K.outer);return v[2]>w[2]?v:w;};mv=r(ms,T.moveDead,mv);lk=r(ls,T.padDead,lk);
if(Math.abs(ax(0))>Math.abs(navX))navX=ax(0);if(Math.abs(ax(1))>Math.abs(navY))navY=ax(1);
});
for(const [key,o] of seen)if(!now.has(key))dis.push({index:o.index,id:o.id});
seen=now;gp=P;for(let j=0;j<2;j++)b[j+6]=trig[j]=trig[j]?tv[j]>K.trigOff:tv[j]>K.trigOn;
if(fa)dev='gamepad';lp=fa||(P.has(lp)?lp:null);
if(block){for(let j=0;j<17;j++)if(b[j])blocked.add(j);block=false;}
for(const j of blocked){if(!b[j])blocked.delete(j);else{b[j]=false;if(j===6||j===7)tv[j-6]=0;}}
const code=cap==='gamepad'&&PAD_BUTTONS.find((n,j)=>j<16&&b[j]&&!pb[j]);
if(code){got={device:cap,code};cap=null;quiet=true;}
const val=j=>j===6||j===7?tv[j-6]>K.valueDead?Math.min(1,(tv[j-6]-K.valueDead)/(1-K.valueDead)):0:+!!b[j];
for(const s of A){const was=on(s);s.g=s.pi.some(j=>b[j]);s.gv=s.pi.reduce((m,j)=>Math.max(m,val(j)),0);rise(s,was,1);}
const moveGain=C.moveCurve&&mv[2]>0?Math.pow(mv[2],T.padCurve)/mv[2]:1;pmx=mv[0]*moveGain;pmy=-mv[1]*moveGain;
if(walk&&walk.run){const s=walk.run,was=on(s);s.gr=mv[2]>=K.padRun;rise(s,was,1);}
const [x,y,n]=lk,c=n>0?Math.pow(n,T.padCurve)/n:0;hold=n>K.boostAt?hold+dt:0;
const e=hold>K.boostAfter?Math.min(1,(hold-K.boostAfter)/K.boostRamp):0;
px+=x*c*T.padYaw*(1+T.padBoost*e)*sc*Math.PI/180*dt;py+=-y*c*T.padPitch*sc*(T.padInvertY?-1:1)*Math.PI/180*dt;
if(look){px+=axis(look.x)*dt*look.rate;py+=axis(look.y)*dt*look.rate;}
let nav=null;
if(C.menu&&!got){
const dir=b[12]?'up':b[13]?'down':b[14]?'left':b[15]?'right':Math.abs(navY)>.5?(navY<0?'up':'down'):Math.abs(navX)>.5?(navX<0?'left':'right'):'';
const adjust=b[4]||b[6]?'decrease':b[5]||b[7]?'increase':'',repeat=adjust||dir,key=repeat;
const changed=key!==navKey;if(changed){navKey=key;nh=0;nd=K.navDelay;}else nh+=dt;
const moved=key&&(changed||nh>=nd);if(moved&&nh>0)nd+=K.navRepeat;
nav={direction:moved&&!adjust?dir:null,adjust:moved&&adjust?adjust:null,accept:!!b[0]&&!pb[0]&&!quiet,back:!!b[1]&&!pb[1]&&!quiet,previous:!!b[4]&&!pb[4]&&!quiet,next:!!b[5]&&!pb[5]&&!quiet};
}
pb=b;quiet=false;
const r={pressed:pressed.slice(),nav,device:dev,deviceChanged:dev!==shown,connected:con,disconnected:dis,pads:[...now.values()].map(card),captured:got};
shown=dev;got=null;pressed.length=0;for(const s of A)s.edge=false;return r;
},
step(){
const o={};
for(const s of sticks){let x=px,y=py;if(s.move){x=axis(s.x);y=axis(s.y);if(pmx*pmx+pmy*pmy>x*x+y*y){x=pmx;y=pmy;}if(tmx*tmx+tmy*tmy>x*x+y*y){x=tmx;y=tmy;}}o[s.kx]=x||0;o[s.ky]=y||0;}
px=py=0;
for(const s of A){const k=s.a.type;o[s.a.id]=k==='press'?s.latch:k==='hold'?on(s)||s.latch:Math.max(s.gv,s.k>0||s.m||s.t>0?1:0);s.latch=false;}
return o;
},
pendingLook(){return {x:px||0,y:py||0};}
};
}
G.FInput={version:1,PAD_BUTTONS,TUNE,create,defaults,normalize,assign,unbind,keyName,radial,padStyle,glyph,guessDevice,focusMove};
})(typeof window!=='undefined'?window:globalThis);
