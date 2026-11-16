/* EMPRISE — original seeded materials, generated in memory. No bitmap assets. */
(function(G){'use strict';
const SIZE=256,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function hash(x,y,seed){let n=Math.imul(x+seed,374761393)^Math.imul(y+seed,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(x,y,period,seed){const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,s=u*u*(3-2*u),t=v*v*(3-2*v),h=(a,b)=>hash((a+period)%period,(b+period)%period,seed);return (h(ix,iy)*(1-s)+h(ix+1,iy)*s)*(1-t)+(h(ix,iy+1)*(1-s)+h(ix+1,iy+1)*s)*t;}
function layer(kind){const h=new Float32Array(SIZE*SIZE),seed=kind?731:135;
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const broad=noise(x/32,y/32,8,seed),grain=hash(x,y,seed);h[y*SIZE+x]=kind?broad*.45+noise(x/4,y/4,64,seed+2)*.35+grain*.2:noise(x/2,y/2,128,seed+3)*.62+grain*.25+broad*.13;}
 const images={};for(const key of ['diff','nor_gl','rough']){const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;const ctx=canvas.getContext('2d'),data=ctx.createImageData(SIZE,SIZE);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const i=y*SIZE+x,v=h[i],at=(a,b)=>h[((b+SIZE)%SIZE)*SIZE+(a+SIZE)%SIZE];let rgb;
   if(key==='nor_gl'){const dx=(at(x-1,y)-at(x+1,y))*(kind?.65:1.2),dy=(at(x,y-1)-at(x,y+1))*(kind?.65:1.2),n=Math.hypot(dx,dy,1);rgb=[dx/n*.5+.5,dy/n*.5+.5,1/n*.5+.5];}
   else if(key==='rough')rgb=Array(3).fill(clamp((kind?.86:.88)+(v-.5)*.12));
   else {const c=kind?.46+v*.20:.105+v*.14;rgb=kind?[c*1.05,c*1.015,c*.94]:[c*.94,c*.98,c];}
   for(let j=0;j<3;j++)data.data[i*4+j]=Math.round(clamp(rgb[j])*255);data.data[i*4+3]=255;
  }ctx.putImageData(data,0,0);images[key]=canvas;
 }return images;
}
G.FMaterials=Object.freeze({create(){return {layers:[],async load(){this.layers=[layer(0),layer(1)];return this.layers;}};}});
})(globalThis);
