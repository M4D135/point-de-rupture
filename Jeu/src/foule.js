if(typeof module!=='undefined'&&module.exports){require('./crowd-style.js');require('./ferro/crowd.js');}
/* PDR content style, common FERRO crowd engine. */
(function(PDR){const style=PDR.crowdStyle;PDR.foule=FCrowd.createProfile({rules:PDR.regles,shaders:style.shaders,scale:style.ECHELLE,heights:style.HAUTEURS,buildMeshes:style.construireMaillages});})(globalThis.PDR=globalThis.PDR||{});
