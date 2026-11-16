/* FERRO — native backend selection. A canvas can own only one context type. */
(function(root){'use strict';
 const preference=value=>['auto','webgpu','webgl2'].includes(value)?value:'auto';
 function isSafariOnApple(userAgent){
  if(typeof userAgent!=='string'||/(?:Chrome|Chromium|CriOS|Firefox|FxiOS|Edg|OPR\/|OPiOS|Opera|Android|SamsungBrowser)/i.test(userAgent))return false;
  return /\b(?:Macintosh|Mac OS X|iPhone|iPad|iPod)\b/.test(userAgent)&&/AppleWebKit\//.test(userAgent)&&/Version\/\d/.test(userAgent)&&/Safari\/\d/.test(userAgent);
 }
 function replaceCanvas(canvas){const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);return fresh;}
 const reason=error=>String(error?.message||error||'Erreur WebGPU inconnue.').slice(0,500);
 // Cleanup must not prevent fallback or create an unhandled rejection when a
 // timed-out adapter eventually finishes. A rejected GPU is never reactivated.
 function release(renderer){try{renderer?.dispose?.();}catch{}}
 async function create(canvas,options={},providers={}){
  const requiredGL=!!(options.sceneReflections||options.advancedSky||options.resolution==='native'),requested=preference(options.backend),gpu=providers.webgpu||root.FRenderWebGPU?.create,gl=providers.webgl2||root.FRender?.create;
  // Host opt-in after browser-specific pacing measurements. Explicit backend
  // choices and other hosts retain their existing selection policy.
  const preferSafariGL=requested==='auto'&&options.preferWebGL2OnSafari===true&&isSafariOnApple(providers.userAgent??root.navigator?.userAgent);
  const supported=providers.supported??!!root.navigator?.gpu,replace=providers.replaceCanvas||replaceCanvas;
  let fallbackReason=requiredGL?'Profil de rendu avancé disponible en WebGL2.':preferSafariGL?'WebGL2 privilégié pour la fluidité dans Safari.':null,phase='initializing',failure=null,timedOut=false,timer=null,activationResult;
  function deliver(){
   if(phase!=='active'||!failure)return activationResult;
   phase='failed';
   const callback=failure.kind==='lost'?options.onDeviceLost:options.onError;
   activationResult=callback?.(failure.info);return activationResult;
  }
  function incident(kind,info){
   if(phase==='failed'||phase==='abandoned')return;
   failure??={kind,info};
   if(phase==='active')return deliver();
  }
  // The caller owns the canvas, installs its scene and publishes its renderer
  // before activation. Loss/errors in that handoff interval cannot be dropped.
  function activate(){
   if(phase==='pending'){phase='active';return deliver();}
   return activationResult;
  }
  if(requested!=='webgl2'&&!requiredGL&&!preferSafariGL){
   if(supported&&gpu){
    let candidate=null;
    try{
     const pending=Promise.resolve().then(()=>gpu(canvas,{...options,onDeviceLost:info=>incident('lost',info),onError:error=>incident('error',error)}));
     pending.then(renderer=>{if(timedOut)release(renderer);},()=>{});
     const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;reject(new Error('Initialisation WebGPU trop longue.'));},options.initTimeoutMs??30000);});
     candidate=await Promise.race([pending,deadline]);clearTimeout(timer);
     if(failure)throw new Error(failure.kind==='lost'?'Périphérique WebGPU perdu pendant son initialisation.':'Erreur WebGPU pendant son initialisation : '+reason(failure.info));
     if(candidate?.stats?.backend!=='webgpu')throw new Error('Backend WebGPU natif indisponible.');
     candidate.stats.requestedBackend=requested;candidate.stats.fallbackReason=null;phase='pending';
     return {renderer:candidate,canvas,requested,backend:'webgpu',fallbackReason:null,activate};
    }catch(error){
     clearTimeout(timer);phase='abandoned';release(candidate);
     fallbackReason=reason(error);canvas=replace(canvas);
    }
   }else fallbackReason=supported?'Backend WebGPU non chargé.':'WebGPU indisponible dans ce navigateur.';
  }
  if(!gl)throw new Error('Backend WebGL2 indisponible.');
  const renderer=gl(canvas,options);
  if(!renderer?.gl||renderer.stats?.backend!=='webgl2'){release(renderer);throw new Error('Un navigateur avec WebGPU ou WebGL2 est nécessaire.');}
  renderer.stats.requestedBackend=requested;renderer.stats.fallbackReason=fallbackReason;
  return {renderer,canvas,requested,backend:'webgl2',fallbackReason,activate(){}};
 }
 root.FRenderBackends={create,replaceCanvas,preference,isSafariOnApple,capabilities:{webgl2:{proceduralPBR:true,crowds:true,screenReflections:true,localProbes:true,advancedSky:true,nativeSurface:true},webgpu:{proceduralPBR:true,crowds:true,screenReflections:true,localProbes:false,advancedSky:false,nativeSurface:false}}};
})(globalThis);
