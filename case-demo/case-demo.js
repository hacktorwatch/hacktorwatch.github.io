import * as THREE from 'three';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';

const canvas = document.getElementById('case-canvas');
const button = document.getElementById('case-playback');
const seek = document.getElementById('case-seek');
const label = document.getElementById('case-stage');
const status = document.getElementById('case-status');
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const DURATION = 20;
const source = window.HACKTOR_CASE_MODELS;
const [cx, cy] = source.caseCenter;
const cz = 2.85;
const watch = new THREE.Group();
const parts = new Map();
let renderer, camera, scene, clock, texture, screenMaterial, lastState;
let playing = false, inView = false, request = 0, elapsed = 0, origin = 0;
const smooth = value => {const t = THREE.MathUtils.clamp(value, 0, 1); return t*t*(3-2*t);};
const span = (t, start, end) => smooth((t-start)/(end-start));
const qFront = new THREE.Quaternion().setFromEuler(new THREE.Euler(.08,-.20,-.13));
const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,-.20));

function addPart(id, object, travel) {
  object.name = id;
  object.userData.travel = new THREE.Vector3(...travel);
  object.userData.base = object.position.clone();
  watch.add(object); parts.set(id, object);
  return object;
}
function cadGeometry(part) {
  const g = new THREE.BufferGeometry();
  // Rotate the source 180° around Y so the front faces +Z and its buttons
  // appear on the right. Original STL triangles and crease normals survive.
  const p = new Float32Array(part.positions);
  const n = new Float32Array(part.normals);
  for (let i=0;i<p.length;i+=3) {
    p[i]=cx-p[i]; p[i+1]-=cy; p[i+2]=cz-p[i+2];
    n[i]*=-1; n[i+2]*=-1;
  }
  g.setAttribute('position',new THREE.BufferAttribute(p,3));
  g.setAttribute('normal',new THREE.BufferAttribute(n,3));
  g.setIndex(part.indices); g.computeBoundingSphere();
  return g;
}
function cylinder(radius, height, material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,128),material);
  mesh.rotation.x = Math.PI/2;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
function image(url) {
  return new Promise((resolve,reject)=>{
    const img=new Image(); img.onload=()=>resolve(img); img.onerror=()=>reject(new Error(`Cannot load ${url}`)); img.src=url;
  });
}
function plasticMaterial() {
  const material = new THREE.MeshPhysicalMaterial({color:0x14191d,roughness:.55,metalness:0,clearcoat:.08,clearcoatRoughness:.6,specularIntensity:.65,envMapIntensity:.8});
  // Fine molded/printed-polymer roughness, evaluated in model coordinates.
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGrain;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGrain=position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vGrain;').replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nfloat grain=fract(sin(dot(floor(vGrain*42.0),vec3(12.9898,78.233,37.719)))*43758.5453); roughnessFactor=clamp(roughnessFactor+(grain-.5)*.11,0.0,1.0);');
  };
  return material;
}
function boardTexture(side) {
  const b=source.pcb, size=2048, scale=size/50;
  const c=document.createElement('canvas');c.width=c.height=size;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#164127';ctx.fillRect(0,0,size,size);
  const x=v=>(v+25)*scale, y=v=>(25-v)*scale;
  function paths(items,color) {
    ctx.strokeStyle=color;ctx.lineCap='round';ctx.lineJoin='round';
    for (const item of items) {
      if (item.side!==side) continue;
      if(item.rectangle){const [a,b,c,d]=item.rectangle;ctx.fillStyle=color;ctx.fillRect(x(a),y(d),(c-a)*scale,(d-b)*scale);continue;}
      if(item.text){ctx.save();ctx.translate(x(item.x),y(item.y));ctx.rotate(-(item.rotation||0)*Math.PI/180);ctx.fillStyle=color;ctx.font=`${item.size*scale}px sans-serif`;ctx.fillText(item.text,0,0);ctx.restore();continue;}
      if(!item.points)continue;
      ctx.lineWidth=Math.max(.65,item.width*scale);
      ctx.beginPath();item.points.forEach((p,i)=>i?ctx.lineTo(x(p[0]),y(p[1])):ctx.moveTo(x(p[0]),y(p[1])));ctx.stroke();
    }
  }
  paths(b.traces,'#215235');paths(b.silk,'#c4c7ae');
  for (const pad of b.smds) {
    if (pad.side!==side)continue;
    ctx.save();ctx.translate(x(pad.x),y(pad.y));ctx.rotate(-pad.rotation*Math.PI/180);
    ctx.fillStyle='#d3b454';ctx.fillRect(-pad.dx*scale/2,-pad.dy*scale/2,pad.dx*scale,pad.dy*scale);ctx.restore();
  }
  for (const via of [...b.pads,...b.vias]) {
    ctx.fillStyle='#c4a959';ctx.beginPath();ctx.arc(x(via.x),y(via.y),via.diameter*scale/2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#10261c';ctx.beginPath();ctx.arc(x(via.x),y(via.y),via.drill*scale/2,0,Math.PI*2);ctx.fill();
  }
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;return map;
}
function buildBoard() {
  const pcb=new THREE.Group(), b=source.pcb;
  const shape=new THREE.Shape(b.outline.map(p=>new THREE.Vector2(...p)));
  for (const h of b.holes) {
    const hole=new THREE.Path();hole.absarc(h.x,h.y,h.radius,0,Math.PI*2,true);shape.holes.push(hole);
  }
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.8,bevelEnabled:false,curveSegments:64});
  geometry.translate(0,0,3.6);
  const core=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x7e8050,roughness:.7}));
  core.castShadow=true;core.receiveShadow=true;pcb.add(core);
  for (const side of ['top','bottom']) {
    const g=new THREE.ShapeGeometry(shape,64), uv=g.attributes.uv, p=g.attributes.position;
    for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)+25)/50,(p.getY(i)+25)/50);
    const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({map:boardTexture(side),roughness:.46,metalness:.15,side:THREE.DoubleSide}));
    mesh.position.z=side==='top'?4.405:3.595;mesh.receiveShadow=true;pcb.add(mesh);
  }
  const chip=new THREE.MeshStandardMaterial({color:0x171b1e,roughness:.65,metalness:.04});
  const ceramic=new THREE.MeshStandardMaterial({color:0x8c8057,roughness:.43,metalness:.12});
  const metal=new THREE.MeshStandardMaterial({color:0xaeb4b5,roughness:.25,metalness:.9});
  for (const part of b.components) {
    const pads=b.smds.filter(p=>p.element===part.name);
    let bounds=part.bodyBounds;
    if(!bounds&&pads.length) {
      const xs=pads.map(p=>p.x), ys=pads.map(p=>p.y);
      const dx=Math.max(...xs)-Math.min(...xs)+.2,dy=Math.max(...ys)-Math.min(...ys)+.2;
      bounds=[[-Math.max(.35,dx)/2,-Math.max(.35,dy)/2],[Math.max(.35,dx)/2,Math.max(.35,dy)/2]];
    }
    if(!bounds)continue;
    const width=(bounds[1][0]-bounds[0][0])*.72, height=(bounds[1][1]-bounds[0][1])*.72;
    const thickness=/^(U|IC|J)/.test(part.name)?1.15:/^Y/.test(part.name)?.8:.45;
    const material=/^Y|TYPE-C/.test(part.name+part.package)?metal:/^C|^L/.test(part.name)?ceramic:chip;
    const body=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.3,width),Math.max(.3,height),thickness),material);
    const ang=part.rotation*Math.PI/180,dx=(bounds[0][0]+bounds[1][0])/2,dy=(bounds[0][1]+bounds[1][1])/2;
    body.position.set(part.x+dx*Math.cos(ang)-dy*Math.sin(ang),part.y+dx*Math.sin(ang)+dy*Math.cos(ang),part.side==='top'?4.4+thickness/2:3.6-thickness/2);
    body.rotation.z=ang;body.castShadow=true;body.receiveShadow=true;pcb.add(body);
  }
  pcb.position.set(cx, -cy, cz);pcb.rotation.y=Math.PI;
  return addPart('pcb',pcb,[0,0,-5]);
}
async function buildDisplay() {
  const group=new THREE.Group();
  const shell=new THREE.MeshStandardMaterial({color:0x171b1e,roughness:.35,metalness:.15});
  const backing=cylinder(20.8,1.25,shell);backing.position.z=5.1;group.add(backing);
  const dark=new THREE.MeshStandardMaterial({color:0x010304,roughness:.22,metalness:0,envMapIntensity:.15});
  const bezel=new THREE.Mesh(new THREE.CircleGeometry(21.1,128),dark);bezel.position.z=5.74;group.add(bezel);
  const names=['analog-dial.png','hour-hand.png','minute-hand.png','second-hand.png','shoe-icon.png','font2-atlas.png','roboto-thin24-atlas.png','digital-digits.png'];
  const images=Object.fromEntries(await Promise.all(names.map(async name=>[name,await image(new URL(`../assets/watch-animation/${name}`,import.meta.url).href)])));
  clock=window.createWatchFaceRenderer({metadata:window.WATCH_DEMO_ASSETS.metadata,images});
  clock.render('analog',new Date(2026,10,7,10,8,52));
  texture=new THREE.CanvasTexture(clock.canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  screenMaterial=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
  const lcd=new THREE.Mesh(new THREE.CircleGeometry(16.25,128),screenMaterial);lcd.position.z=5.77;group.add(lcd);
  const glass=new THREE.Mesh(new THREE.CircleGeometry(21.1,128),new THREE.MeshPhysicalMaterial({color:0xf6faff,roughness:.06,metalness:0,transmission:1,thickness:.4,ior:1.48,clearcoat:0,envMapIntensity:.2,specularIntensity:.35}));
  glass.position.z=5.80;group.add(glass);
  addPart('display',group,[0,0,37]);
}
async function buildBattery() {
  const group=new THREE.Group();
  const material=new THREE.MeshStandardMaterial({color:0xbcc1c3,roughness:.32,metalness:.65});
  const body=new THREE.Mesh(new THREE.BoxGeometry(20,30,3.6),material);body.castShadow=true;body.receiveShadow=true;group.add(body);
  // The original repository's disassembled render includes its real battery
  // photograph. Use that region as the foil wrapper rather than invent a label.
  try {
    const img=await image(new URL('./source/disassembled.png',import.meta.url).href);
    const c=document.createElement('canvas');c.width=400;c.height=600;
    c.getContext('2d').drawImage(img,1433,2775,449,727,0,0,400,600);
    const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
    const wrapper=new THREE.Mesh(new THREE.PlaneGeometry(20,30),new THREE.MeshStandardMaterial({map,roughness:.48,metalness:.25}));
    wrapper.position.z=1.81;group.add(wrapper);
  } catch { /* The metal wrapper remains visible if a source image is absent. */ }
  const tape=new THREE.MeshStandardMaterial({color:0xdcae30,roughness:.42,metalness:.18});
  for(const y of [-14.6,14.6]){const strip=new THREE.Mesh(new THREE.BoxGeometry(20.3,.8,3.8),tape);strip.position.y=y;group.add(strip);}
  group.position.set(0,1,1.65);addPart('battery',group,[0,0,9]);
}
function timeline(seconds) {
  const phase=((seconds%DURATION)+DURATION)%DURATION;
  const flat=phase<17?span(phase,4,7):1-span(phase,17,20);
  const explosion=phase<14.5?span(phase,8,11.5):1-span(phase,14.5,17);
  const screenOn=(1-span(phase,8.0,8.6))* (phase<14.5?1:0) + span(phase,17.3,18.2);
  let stage='assembled';
  if(phase>=4&&phase<7)stage='rotating';else if(phase>=7&&phase<8)stage='flat';else if(phase>=8&&phase<11.5)stage='exploding';else if(phase>=11.5&&phase<14.5)stage='exploded';else if(phase>=14.5&&phase<17)stage='reassembling';else if(phase>=17)stage='returning';
  return {phase,flat,explosion,screenOn:Math.min(1,screenOn),stage};
}
function renderAt(seconds) {
  if(!renderer||!clock)return;
  const state=timeline(seconds),{phase,flat,explosion,screenOn}=state;
  watch.quaternion.copy(qFront).slerp(qFlat,flat);
  watch.position.set(0,THREE.MathUtils.lerp(28,9,flat)+explosion*24,0);
  for(const part of parts.values())part.position.copy(part.userData.base).addScaledVector(part.userData.travel,explosion);
  const zoom=1+flat*.04+explosion*.32;
  camera.position.set(42*zoom,(40+45*flat)*zoom,112*zoom);
  camera.lookAt(0,THREE.MathUtils.lerp(28,11,flat)+explosion*26,0);
  const time=phase>=17?phase-DURATION:phase;
  clock.render('analog',new Date(2026,10,7,10,8,52,Math.round(time*1000)));
  texture.needsUpdate=true;screenMaterial.color.setScalar(screenOn);
  renderer.render(scene,camera);
  seek.value=phase;
  const names={assembled:'The watch',rotating:'Turning face-up',flat:'Face-up',exploding:'Opening the case',exploded:'Inside the case',reassembling:'Back together',returning:'Ready to wear'};
  label.textContent=names[state.stage];
  lastState={...state,parts:[...parts].map(([id,p])=>({id,position:p.position.toArray()})),poseQuaternion:watch.quaternion.toArray()};
  return lastState;
}
function suspend(){if(request)elapsed=(performance.now()-origin)/1000;cancelAnimationFrame(request);request=0;}
function resume(){if(!playing||!inView||document.hidden||request)return;origin=performance.now()-elapsed*1000;request=requestAnimationFrame(tick);}
function tick(now){if(!playing||!inView||document.hidden){request=0;return;}elapsed=(now-origin)/1000;renderAt(elapsed);request=requestAnimationFrame(tick);}
function controlState(){button.textContent=playing?'Pause':'Play';button.setAttribute('aria-label',playing?'Pause case animation':'Play case animation');status.textContent=playing?'Case animation playing.':'Case animation paused.';}
function play(){if(!renderer)return;playing=true;controlState();resume();}
function pause(){suspend();playing=false;controlState();}
button.addEventListener('click',()=>playing?pause():play());
seek.addEventListener('input',()=>{pause();elapsed=Number(seek.value);renderAt(elapsed);});
document.querySelectorAll('[data-case-seek]').forEach(b=>b.addEventListener('click',()=>{pause();elapsed=Number(b.dataset.caseSeek);renderAt(elapsed);}));
document.addEventListener('visibilitychange',()=>document.hidden?suspend():resume());
new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;inView?resume():suspend();}).observe(canvas);
reduced.addEventListener('change',event=>{if(event.matches)pause();});

const ready=(async()=>{
  scene=new THREE.Scene();scene.background=new THREE.Color('#f2f0e9');scene.add(watch);
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(1);renderer.setSize(1200,1500,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  camera=new THREE.PerspectiveCamera(32,4/5,.1,1000);
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(renderer);
  scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
  const key=new THREE.DirectionalLight(0xfff5e4,3.2);key.position.set(-55,100,80);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-90,right:90,top:120,bottom:-65,near:1,far:300});key.shadow.bias=-.0004;key.shadow.normalBias=.05;
  scene.add(key);scene.add(new THREE.HemisphereLight(0xf4f6ff,0xb3aba0,1.1));
  const rim=new THREE.DirectionalLight(0xd9e6ff,2.1);rim.position.set(65,30,-80);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),new THREE.ShadowMaterial({color:0x4a4e47,opacity:.07}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=256;
  const shadowContext=shadowCanvas.getContext('2d'),gradient=shadowContext.createRadialGradient(128,128,8,128,128,128);
  gradient.addColorStop(0,'rgba(38,42,36,.14)');gradient.addColorStop(.45,'rgba(38,42,36,.07)');gradient.addColorStop(1,'rgba(38,42,36,0)');
  shadowContext.fillStyle=gradient;shadowContext.fillRect(0,0,256,256);
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(90,90),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
  contact.rotation.x=-Math.PI/2;contact.position.y=.02;scene.add(contact);
  const plastic=plasticMaterial();
  for(const data of source.parts){const mesh=new THREE.Mesh(cadGeometry(data),plastic);mesh.castShadow=true;mesh.receiveShadow=true;addPart(data.id,mesh,data.id==='main_body'?[0,0,20]:data.id==='bottom_lid'?[0,0,-24]:[13,0,-5]);}
  buildBoard();await Promise.all([buildDisplay(),buildBattery()]);
  renderAt(0);button.hidden=false;controlState();
  if(!reduced.matches&&params.get('autoplay')!=='0')play();
  return api;
})().catch(error=>{status.classList.remove('sr-only');status.textContent=`The 3D preview could not load. ${error.message}`;console.error(error);throw error;});
const api={canvas,ready,duration:DURATION,samples:{assembled:0,flat:7.5,exploded:12.5},renderAt,play,pause,getState:()=>lastState,get isPlaying(){return playing;}};
window.caseDemo=api;
