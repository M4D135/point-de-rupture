/* FERRO common host API. Modules remain optional and game rules stay in adapters. */
(function(G){'use strict';
 const names={passages:'FPassages',tacticalNetwork:'FBrain',loop:'FLoop',scheduler:'FSchedule',jobs:'FJobs',demo:'FDemo',surface:'FSurface',gpuProfile:'FGPUProfile',skies:'FSky',reflections:'FSceneReflections',render:'FRender',backends:'FRenderBackends',physics:'FPhysics',physicsGeometry:'FPhysicsGeometry',geometry:'FGeometry',vehicleDynamics:'FVehicleDynamics',navigation:'FNavigation',crowd:'FCrowd',crowdWebGPU:'FCrowdWebGPU',materials:'FMaterials',destruction:'FDestruction',input:'FInput',audio:'FAudio',motion:'FMotion',effects:'FEffects',recipes:'FRecipes',math:'FMath',music:'FMusic',musicTransitions:'FImuse'};
 function requireModule(name){const module=G[names[name]];if(!module)throw new Error('FERRO : module '+name+' non chargé.');return module;}
 const api={version:'0.3.2',apiVersion:1,
  capabilities(){return Object.fromEntries(Object.entries(names).map(([name,key])=>[name,!!G[key]]));},
  require:requireModule,
  async createRenderer(canvas,options={}){const materials=options.materials||requireModule('materials').create();if(!materials.layers.length)await materials.load();return requireModule('backends').create(canvas,{...options,materials});},
  // Existing saves retain the original profile when their game calls FPhysics.
  // Newly authored physical worlds explicitly use the geometry-aware profile.
  createPhysics(options){return requireModule('physics').create({bounded:true,geometry:true,...options});},
  createAudio(options){return requireModule('audio').create(options);},
  compileRecipe(recipe){return requireModule('recipes').compile(recipe);}
 };
 for(const name of Object.keys(names))Object.defineProperty(api,name,{enumerable:true,get(){return requireModule(name);}});
 G.FERRO=Object.freeze(api);
})(globalThis);
