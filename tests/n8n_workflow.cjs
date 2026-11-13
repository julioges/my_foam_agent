// Exercises exported node code and connections with simulated Ollama/native tools.
const fs=require('fs'),cp=require('child_process'),os=require('os'),path=require('path'),assert=require('assert');
const w=JSON.parse(fs.readFileSync((process.argv[2]||path.join(__dirname,'..','FOAM_AGENT_N8N_AI_AGENTS.json')),'utf8'));
const byName=Object.fromEntries(w.nodes.map(n=>[n.name,n]));
assert.equal(Object.keys(byName).length,w.nodes.length);
for(const [name,c] of Object.entries(w.connections)){assert(byName[name]); for(const branches of Object.values(c)) for(const branch of branches) for(const e of branch) assert(byName[e.node]);}

const agents=w.nodes.filter(n=>n.type==='@n8n/n8n-nodes-langchain.agent');
assert.equal(agents.length,8);
assert.equal(w.nodes.length,107);
assert(!/base64|gzip|eval\(/i.test(JSON.stringify(w)));
assert.equal(w.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequestTool').length,6);
assert.equal(w.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest').length,0);
const sessions=new Set();
for(const agent of agents){
 assert.equal(agent.typeVersion,3.1);assert.equal(agent.parameters.hasOutputParser,true);
 for(const [port,type] of [['ai_languageModel','lmChatOllama'],['ai_memory','memoryBufferWindow'],['ai_outputParser','outputParserStructured']]){
  const sources=w.nodes.filter(n=>w.connections[n.name]?.[port]?.flat().some(e=>e.node===agent.name));
  assert.equal(sources.length,1,agent.name+' '+port);
  const sub=sources[0];assert.equal(sub.type,'@n8n/n8n-nodes-langchain.'+type);
  if(type==='lmChatOllama')assert.equal(sub.parameters.model,'devstral-small-2:24b');
  if(type==='outputParserStructured'){assert.equal(sub.parameters.schemaType,'manual');assert.equal(JSON.parse(sub.parameters.inputSchema).type,'object');}
  if(type==='memoryBufferWindow'){
   assert.equal(sub.parameters.sessionIdType,'customKey');assert.equal(sub.parameters.contextWindowLength,2);
   const expression=sub.parameters.sessionKey.slice(3,-3);
   const key=run_id=>new Function('$','return ('+expression+')')(()=>({first:()=>({json:{run_id}})}));
   const a=key('run-a'),b=key('run-b');assert.notEqual(a,b);assert(!sessions.has(a));sessions.add(a);
  }
 }
}
console.log('PASS 8 AI Agents; 8 Ollama models; 8 isolated local memories; 8 structured parsers; no HTTP agents');


const mainNodes=w.nodes.filter(n=>!n.type.endsWith('.lmChatOllama')&&!n.type.endsWith('.memoryBufferWindow')&&!n.type.endsWith('.outputParserStructured')&&!n.type.endsWith('.httpRequestTool'));
const incoming=new Map(mainNodes.map(n=>[n.name,[]])),outgoing=new Map(mainNodes.map(n=>[n.name,[]]));
for(const [a,c]of Object.entries(w.connections))for(const branch of c.main||[])for(const e of branch){incoming.get(e.node)?.push(a);outgoing.get(a)?.push(e.node);}
assert.deepEqual(mainNodes.filter(n=>!incoming.get(n.name).length).map(n=>n.name),['Inicio manual']);
assert.deepEqual(mainNodes.filter(n=>!outgoing.get(n.name).length).map(n=>n.name),['Resultado e historial']);
function reach(start,map){const found=new Set([start]),todo=[start];while(todo.length)for(const next of map.get(todo.pop())||[])if(!found.has(next)){found.add(next);todo.push(next);}return found;}
assert.equal(reach('Inicio manual',outgoing).size,mainNodes.length);assert.equal(reach('Resultado e historial',incoming).size,mainNodes.length);
for(const n of mainNodes){if(['Inicio manual','Resultado e historial','Recoger error y preparar informe'].includes(n.name))continue;assert.equal(n.onError,'continueErrorOutput');assert.equal(w.connections[n.name].main[n.type.endsWith('.if')?2:1][0].node,'Recoger error y preparar informe');}
console.log('PASS one main entry, one final report, full reachability and explicit error outputs');

const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
for(const n of w.nodes){if(n.type.endsWith('.code'))new AsyncFunction('$input','$execution','$','require','Buffer',n.parameters.jsCode);}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'foam-n8n-test-'));const bin=path.join(temp,'bin');fs.mkdirSync(bin);const inputs=path.join(temp,'inputs');fs.mkdirSync(inputs);const runs=path.join(temp,'runs');fs.mkdirSync(runs);const tutorials=path.join(temp,'tutorials/incompressible/icoFoam/cavity/system');fs.mkdirSync(tutorials,{recursive:true});fs.writeFileSync(path.join(tutorials,'controlDict'),'application icoFoam;');
function executable(name,text){fs.writeFileSync(path.join(bin,name),text,{mode:0o755});}
const bashrc=path.join(temp,'bashrc');fs.writeFileSync(bashrc,'export WM_PROJECT_VERSION=10\n');
executable('blockMesh',`#!/usr/bin/env python3\nfrom pathlib import Path\np=Path('constant/polyMesh');p.mkdir(parents=True,exist_ok=True)\nfor name in ['points','faces','owner','neighbour','boundary']:(p/name).write_text('mesh')\nprint('End')\n`);
executable('foamDictionary','#!/bin/sh\necho "application icoFoam;"\n');
executable('checkMesh','#!/bin/sh\necho "Mesh OK."\n');
executable('icoFoam',`#!/usr/bin/env python3\nimport os\nfrom pathlib import Path\nprint('Exec : icoFoam')\nif os.getenv('FAIL_SOLVER')=='1': print('FOAM FATAL IO ERROR: redirected-test');raise SystemExit(1)\nif os.getenv('LONG_LOG')=='1':\n for i in range(5000): print('iteration '+str(i)+' '+('x'*100))\nif os.getenv('NO_FIELDS')!='1':\n p=Path('1');p.mkdir(exist_ok=True);(p/'U').write_text('FoamFile { class volVectorField; }\\n')\nprint('End')\n`);
executable('xvfb-run','#!/bin/sh\nshift\nexec "$@"\n');
executable('gmsh',"#!/bin/sh\nprintf '$MeshFormat\\n2.2 0 8\\n$EndMeshFormat\\n' > generated.msh\n");
executable('gmshToFoam',"#!/bin/sh\nexec blockMesh\n");
fs.mkdirSync(path.join(inputs,'case','constant'),{recursive:true});fs.writeFileSync(path.join(inputs,'case','constant','asset.bin'),Buffer.from([0,255,1,2]));
fs.mkdirSync(path.join(inputs,'wrong','system'),{recursive:true});fs.writeFileSync(path.join(inputs,'wrong','system','controlDict'),'/* Website: www.openfoam.com */');
fs.writeFileSync(path.join(inputs,'supplied.msh'),'$MeshFormat\n2.2 0 8\n$EndMeshFormat\n');
cp.execFileSync('/usr/bin/python3',['-c',
 'import zipfile,sys; from pathlib import Path; root=Path(sys.argv[1]); '+
 'z=zipfile.ZipFile(root/"zip-import.zip","w"); z.writestr("constant/asset.bin",bytes([0,255,1,2])); z.close(); '+
 'z=zipfile.ZipFile(root/"zip-traversal.zip","w"); z.writestr("../outside.txt","reject"); z.close(); '+
 'z=zipfile.ZipFile(root/"zip-symlink.zip","w"); info=zipfile.ZipInfo("link"); info.create_system=3; info.external_attr=0o120777<<16; z.writestr(info,"/etc/passwd"); z.close()',inputs]);
for(const tool of w.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequestTool')){
 const make=p=>new Function('$fromAI','return ('+tool.parameters.url.slice(3,-3)+')')(()=>p);
 assert(make('incompressible/icoFoam/cavity/cavity/system/controlDict').startsWith('https://raw.githubusercontent.com/OpenFOAM/OpenFOAM-10/'));
 assert.throws(()=>make('../secret'));assert.throws(()=>make('https://example.com'));
}
function clone(s){return JSON.parse(JSON.stringify(s));}
async function scenario(mode){
 let current='Inicio manual',state={},steps=0;const records={};let id=mode.replaceAll('-','_');let counts={};let repair=false;
 const $=name=>({item:{json:records[name]},first:()=>({json:records[name]})});
 const env={...process.env,PATH:bin+':'+process.env.PATH,TEST_RUNS:runs,TEST_INPUTS:inputs,TEST_TUTORIALS:path.dirname(path.dirname(path.dirname(tutorials))),TEST_BASHRC:bashrc,NO_FIELDS:mode==='false-success'?'1':'0',LONG_LOG:mode==='long-log'?'1':'0',FAIL_SOLVER:mode==='redirected-error'?'1':'0'};
 while(current){
  assert(++steps<350,'Infinite loop '+mode);const n=byName[current];let output=0;
  if(n.type.endsWith('.code')){
   const source=n.parameters.jsCode.replaceAll('/data/runs',runs).replaceAll('/opt/openfoam10/tutorials',env.TEST_TUTORIALS).replaceAll('/opt/openfoam10/etc/bashrc',bashrc).replaceAll('/inputs',inputs);
   const fn=new AsyncFunction('$input','$execution','$','require','Buffer',source);
   const result=await fn({first:()=>({json:state})},{id},$,require,Buffer);state=result[0].json;
   if(current==='Configuracion y estado'){
    state.prompt='Cavity L=1m, kinematic viscosity=0.001 m2/s, lid U=1m/s. Visualize velocity.';
    state.preparation=undefined;
    if(mode.startsWith('zip-'))state.case_path=path.join(inputs,mode+'.zip');
    if(mode==='custom')state.custom_mesh_path=path.join(inputs,'supplied.msh');
    if(mode==='imported')state.case_path=path.join(inputs,'case');
 if(mode==='wrong-target')state.case_path=path.join(inputs,'wrong');
   }
  }else if(n.type==='@n8n/n8n-nodes-langchain.agent'){
   const name=current.replace(' · AI Agent',''); counts[name]=(counts[name]||0)+1;let out;
   const supplied=w.nodes.find(node=>w.connections[node.name]?.ai_outputParser?.flat().some(e=>e.node===current));
   assert.deepEqual(JSON.parse(supplied.parameters.inputSchema),state.agent_request.schema);
   assert.equal(new Function('$json','return ('+n.parameters.text.slice(3,-3)+')')(state),state.agent_request.messages[1].content);
   assert(new Function('$json','return ('+n.parameters.options.systemMessage.slice(3,-3)+')')(state).includes('current request'));

   if(name==='Agente Preparacion')out={ready:mode!=='needs-input',questions:mode==='needs-input'?['Indica viscosidad']:[],reason:mode==='needs-input'?'Missing viscosity':'',target:'foundation-v10',requires_hpc:false,requires_visualization:!['false-success','no-progress','stop'].includes(mode),retrieval_keywords:['cavity','icoFoam']};
   else if(name==='Agente Planificador Malla')out={summary:'Block mesh',mesh_backend:mode==='gmsh'?'gmsh':mode==='custom'?'custom':'standard',solver:'',files:mode==='custom'?[]:[{path:mode==='gmsh'?'mesh.geo':'system/blockMeshDict',instructions:'mesh '+(mode==='static-no-changes'?1:counts[name])}],operations:mode==='gmsh'?['gmsh -3 mesh.geo -format msh2 -o generated.msh','gmshToFoam generated.msh']:mode==='custom'?['gmshToFoam supplied.msh']:['blockMesh']};
   else if(name==='Agente Planificador Solver')out={summary:'Solve',mesh_backend:'standard',solver:'icoFoam',files:[{path:'system/controlDict',instructions:'solver '+(mode==='no-progress'?1:counts[name])}],operations:(mode==='no-progress'||(['runtime-repair','cross-stage'].includes(mode)&&counts[name]===1))?['false']:mode==='redirected-error'?['icoFoam > log.icoFoam 2>&1']:['icoFoam']};
   else if(name==='Agente Escritor Secuencial'){let t=state.file_queue[state.writer_index];out={path:t.path,content:t.instructions+'\n'};}
   else if(name==='Agente Revisor Estatico')out={summary:'checked',findings:['static-repair','static-no-changes'].includes(mode)&&counts[name]===1?[{severity:'error',path:'system/blockMeshDict',evidence:'bad token',message:'fix mesh',suggestion:'repair token'}]:[]};
   else if(name.startsWith('Agente Revisor'))out={decision:['false-success','stop','redirected-error'].includes(mode)?'stop':'repair',repair_stage:mode==='cross-stage'?'mesh':state.stage,analysis:'Fix failed inputs',file_tasks:[],operation_changes:[]};
   else if(name==='Agente Visualizacion')out={script:mode==='visualization-fails'?"raise RuntimeError('test render failure')":"from pathlib import Path\np=Path('plots');p.mkdir(exist_ok=True);(p/'U.png').write_bytes(bytes([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,0,0,0,0]))"};
   else throw Error(name);
   state={output:mode==='json-string-output'?JSON.stringify(out):out};
  }else if(n.type.endsWith('.executeCommand')){
   const expr=n.parameters.command.slice(3,-3);const cmd=new Function('$json','Buffer','$','return ('+expr+')')(state,Buffer,$);
   const r=cp.spawnSync('/bin/bash',['-c',cmd],{env,encoding:'utf8',maxBuffer:12*1024*1024});
   assert.equal(r.status,0,r.stderr);state={exitCode:r.status,stdout:r.stdout,stderr:r.stderr};
  }else if(n.type.endsWith('.if')){
   const expr=n.parameters.conditions.conditions[0].leftValue.slice(3,-3);
   output=new Function('$json','return ('+expr+')')(state)?0:1;
  }
  records[current]=clone(state);
  const next=w.connections[current]?.main[output]?.[0];current=next?.node;
 }
 const expected={'needs-input':'needs_input','false-success':'failed','no-progress':'failed','visualization-fails':'partial_success','static-repair':'success',normal:'success','runtime-repair':'success','cross-stage':'success','static-no-changes':'success',gmsh:'success',custom:'success',imported:'success','wrong-target':'failed','long-log':'success','redirected-error':'failed','json-string-output':'success','zip-import':'success','zip-traversal':'failed','zip-symlink':'failed'}[mode];
 assert.equal(state.status,expected,JSON.stringify(state));
 if(['static-repair','static-no-changes'].includes(mode))assert.equal(state.static_repairs,1);
 if(['runtime-repair','cross-stage'].includes(mode))assert.equal(state.runtime_repairs,1);
 if(mode==='no-progress')assert.equal(state.termination_reason,'repair_made_no_progress');
 if(mode==='false-success')assert.equal(state.solver_succeeded,false);
 if(mode==='visualization-fails'){assert.equal(state.solver_succeeded,true);assert.equal(state.visualization.ok,false);}
 if(mode==='redirected-error')assert(JSON.stringify(state.errors).includes('redirected-test'));
 if(mode==='wrong-target')assert.equal(state.termination_reason,'case_target_mismatch');
 if(['imported','zip-import'].includes(mode))assert.deepEqual(fs.readFileSync(path.join(runs,'n8n_'+id,'original','constant','asset.bin')),Buffer.from([0,255,1,2]));
 const report=path.join(runs,'n8n_'+id,'report.json');assert(fs.existsSync(report));assert.equal(JSON.parse(fs.readFileSync(report)).status,state.status);
 console.log('PASS',mode,steps,'node steps',state.status);
}
(async()=>{try{for(const name of ['normal','needs-input','static-repair','static-no-changes','runtime-repair','cross-stage','no-progress','false-success','visualization-fails','gmsh','custom','imported','wrong-target','long-log','redirected-error','json-string-output','zip-import','zip-traversal','zip-symlink'])await scenario(name);console.log('PASS node syntax, topology, 19 simulated execution scenarios');}finally{fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exit(1)});

(async()=>{const collect=byName['Recoger error y preparar informe'];const report=byName['Resultado e historial'];for(const source of ['Agente Planificador Malla · AI Agent','Guardar archivos y scripts legibles','Ejecutar PyVista']){const state={config:{model:'devstral-small-2:24b'},run_id:'test',solver_succeeded:source==='Ejecutar PyVista',history:[]};const fn=new AsyncFunction('$input','$','$prevNode',collect.parameters.jsCode);const result=await fn({first:()=>({json:{error:{message:'injected failure'}}})},()=>({first:()=>({json:state}),item:{json:state}}),{name:source});const final=await new AsyncFunction('$input',report.parameters.jsCode)({first:()=>result[0]});assert.equal(final[0].json.status,source==='Ejecutar PyVista'?'partial_success':'failed');assert(final[0].json.errors.some(e=>e.message==='injected failure'));}console.log('PASS agent, filesystem and visualization exceptions converge on the final report');})().catch(e=>{console.error(e);process.exitCode=1});
