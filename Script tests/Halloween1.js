// ThreeJS importers
import * as THREE from 'three';
import { GUI } from 'lil-gui';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Scene & Camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, -2, 14);
camera.lookAt(0, 0, 0);

// Song Title Overlay
const songTitle = document.createElement('div');
songTitle.textContent = 'Select audio source in GUI';
songTitle.style.position = 'absolute';
songTitle.style.bottom = '10px';
songTitle.style.right = '10px';
songTitle.style.color = 'white';
songTitle.style.fontFamily = 'Arial, sans-serif';
songTitle.style.fontSize = '14px';
songTitle.style.opacity = '0.85';
songTitle.style.pointerEvents = 'none';
document.body.appendChild(songTitle);

// Audio Setup
const listener = new THREE.AudioListener();
camera.add(listener);
let sound = new THREE.Audio(listener);
let analyser = new THREE.AudioAnalyser(sound, 128);
const audioLoader = new THREE.AudioLoader();
function setupAnalyser() { analyser = new THREE.AudioAnalyser(sound, 128); }

// Hidden File Input
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'audio/*';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    audioLoader.load(event.target.result, (buffer) => {
      if (sound.isPlaying) sound.stop();
      sound = new THREE.Audio(listener);
      sound.setBuffer(buffer);
      sound.setLoop(true);
      sound.setVolume(.5);
      setupAnalyser();
      const displayName = file.name.replace(/\.[^/.]+$/, '');
      songTitle.textContent = `Now Playing: ${displayName}`;
      window.addEventListener('click', () => { if (!sound.isPlaying) sound.play(); }, { once: true });
    }, undefined, (err) => { console.error('Audio load error', err); alert('Failed to load audio file.'); });
  };
  reader.readAsDataURL(file);
});

// Uniforms
const uniforms = {
  u_time: { value: 0.0 },
  u_frequency: { value: 0.0 },
  u_beat: { value: 0.0 },
  u_red: { value: 1.0 },
  u_green: { value: 1.0 },
  u_blue: { value: 1.0 },
  u_waveType: { value: 0 },
};

// Shaders
const vertexShader = `
uniform float u_time; uniform float u_frequency; uniform float u_beat; uniform int u_waveType; 
varying vec3 vNormal; varying vec3 vPosition; 
float wave(float x){
  if(u_waveType==0) return sin(x);
  else if(u_waveType==1) return sign(sin(x));
  else if(u_waveType==2) return (2.0/3.14159265)*asin(sin(x));
  else if(u_waveType==3){ float t = fract(x/(2.0*3.14159265)); return 2.0*t-1.0; }
  return sin(x);
}
void main(){
  vNormal = normal;
  vPosition = position;
  float freq = u_frequency*0.02;
  float flowDisplacement = wave(position.y*5.0 + u_time*3.0) * freq;
  float distFromCenter = length(position);
  float ripple = wave(distFromCenter*10.0 - u_time*30.0) * u_beat * 0.7;
  vec3 newPosition = position + normal*(flowDisplacement + ripple);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;
const fragmentShader = `
uniform float u_red; uniform float u_green; uniform float u_blue; 
varying vec3 vNormal; varying vec3 vPosition; 
void main(){ gl_FragColor = vec4(u_red, u_green, u_blue, 1.0); }
`;

const vertexShaderParticles = `
uniform float u_time; uniform float u_frequency; uniform int u_waveType; varying float vAlpha;
float wave(float x){
  if(u_waveType==0) return sin(x);
  else if(u_waveType==1) return sign(sin(x));
  else if(u_waveType==2) return (2.0/3.14159265)*asin(sin(x));
  else if(u_waveType==3){ float t = fract(x/(2.0*3.14159265)); return 2.0*t-1.0; }
  return sin(x);
}
void main(){
  float freq = u_frequency*0.02;
  vec3 newPosition = position + normal*wave(position.y*5.0 + u_time*3.0)*freq;
  float pulse = 10.0 + 25.0 * sin(u_time*4.0 + position.y*3.0);
  gl_PointSize = pulse;
  vAlpha = 0.5 + 0.5 * sin(u_time + position.x + position.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;
const fragmentShaderParticles = `
uniform float u_red; uniform float u_green; uniform float u_blue; varying float vAlpha;
void main(){
  float dist = distance(gl_PointCoord, vec2(0.5));
  float alpha = smoothstep(0.5, 0.2, dist) * vAlpha;
  gl_FragColor = vec4(u_red, u_green, u_blue, alpha);
}
`;

// Materials
const wireframeMat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, wireframe:true });
const solidMat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, wireframe:false });
const particleMat = new THREE.ShaderMaterial({ uniforms, vertexShader:vertexShaderParticles, fragmentShader:fragmentShaderParticles, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending });

// Jack-o-Lantern Geometry
function createJackOLanternGeometry() {
  const base = new THREE.SphereGeometry(5, 200, 200);
  const pos = base.attributes.position;
  const pumpkinRidges = 12;
  const ridgeDepth = 0.35;
  const squash = 0.75;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    y *= squash;
    const angle = Math.atan2(z, x);
    const radius = Math.sqrt(x*x + z*z);
    const ridge = 1.0 - ridgeDepth * Math.abs(Math.sin(angle*pumpkinRidges));
    x = Math.cos(angle)*radius*ridge;
    z = Math.sin(angle)*radius*ridge;

    // Eyes
    if (y > 1.5 && y < 3 && z > 2.5) { if ((x>0.5 && x<2) || (x<-0.5 && x>-2)) z -= 1.5; }
    // Nose
    if (y > 0.5 && y < 1.5 && z > 2.7 && Math.abs(x)<1) z -= 1.3;
    // Mouth / teeth
    if (y > -1.5 && y < -0.2 && z > 2.5 && Math.abs(x)<3) { const teeth = Math.sin(x*4.0)*0.6; z -= 1.5 + teeth; }

    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  base.computeVertexNormals();
  return base;
}

// Geometries
const geometries = {
  Icosahedron: new THREE.IcosahedronGeometry(3,20),
  Sphere: new THREE.SphereGeometry(3,64,64),
  Torus: new THREE.TorusKnotGeometry(2.5,1,200,32),
  Cube: new THREE.BoxGeometry(6,6,6,40,40,40),
  Octahedron: new THREE.OctahedronGeometry(4,4),
  Dodecahedron: new THREE.DodecahedronGeometry(4,3),
  Cone: new THREE.ConeGeometry(3.5,8,64,64),
  'Jack-o-Lantern': createJackOLanternGeometry(),
};

// Meshes
const defaultGeometry = geometries.Icosahedron.clone();
const meshWireframe = new THREE.Mesh(defaultGeometry.clone(), wireframeMat);
const meshSolid = new THREE.Mesh(defaultGeometry.clone(), solidMat);
const points = new THREE.Points(defaultGeometry.clone(), particleMat);
scene.add(meshWireframe, meshSolid, points);
meshSolid.visible = false;
points.visible = false;

// Postprocessing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth,window.innerHeight));
bloomPass.threshold = 0.6; bloomPass.strength = 0.4; bloomPass.radius = 0.8;
composer.addPass(bloomPass); composer.addPass(new OutputPass());

// GUI
const params = { threshold:0.6,strength:0.4,radius:0.8,geometry:'Icosahedron',bloom:true,displayMode:'Wireframe',audioSource:'MP3 File' };
const gui = new GUI();
const audioSources = {'MP3 File':'file','Microphone':'mic'};
gui.add({source:'file'},'source',Object.keys(audioSources)).name('Audio Source').onChange(async (value)=>{
  if(audioSources[value]==='file') fileInput.click();
  else if(audioSources[value]==='mic'){
    try{
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      const audioContext = listener.context;
      const src = audioContext.createMediaStreamSource(stream);
      const dummyGain = audioContext.createGain(); dummyGain.gain.value = 0;
      src.connect(dummyGain); dummyGain.connect(audioContext.destination);
      sound = new THREE.Audio(listener); sound.setNodeSource(src); setupAnalyser();
      songTitle.textContent = 'Live: Microphone Input';
    } catch(err){ alert('Microphone access denied: '+err.message); }
  }
});

// Bloom folder
const bloomFolder = gui.addFolder('Bloom');
bloomFolder.add(params,'threshold',0,1).onChange(v=>bloomPass.threshold=v);
bloomFolder.add(params,'strength',0,3).onChange(v=>bloomPass.strength=v);
bloomFolder.add(params,'radius',0,1).onChange(v=>bloomPass.radius=v);
bloomFolder.open();

// Geometry selector
gui.add(params,'geometry',Object.keys(geometries)).name('Geometry').onChange(name=>{
  const newGeo = geometries[name].clone();
  meshWireframe.geometry.dispose(); meshWireframe.geometry = newGeo.clone();
  meshSolid.geometry.dispose(); meshSolid.geometry = newGeo.clone();
  points.geometry.dispose(); points.geometry = newGeo.clone();
});

// Display mode
gui.add(params,'displayMode',['Wireframe','Solid','Particle Cloud']).name('Display Mode').onChange(mode=>{
  meshWireframe.visible = mode==='Wireframe';
  meshSolid.visible = mode==='Solid';
  points.visible = mode==='Particle Cloud';
  bloomPass.enabled = mode!=='Particle Cloud' && params.bloom;
});

// Bloom toggle
gui.add(params,'bloom').name('Enable Bloom').onChange(enabled=>{ bloomPass.enabled = enabled && params.displayMode!=='Particle Cloud'; });

// --- Audio-reactive variables and animation loop ---
let beatThreshold=1.15, beatHoldFrames=15, beatDecayRate=0.98, beatCutoff=0, beatFrameCounter=0, isBeat=false, averageFreq=0;
let smoothedFreq = 0.0;
const FREQ_SMOOTH = 0.08;
let currentColor = { r:1, g:1, b:1 };
const COLOR_SMOOTH = 0.06;
const QUIET_THRESHOLD = 6.0;

// Halloween colors
const HalloweenColors = {
  base: new THREE.Color(0xff8c00),   // dark orange pumpkin
  highlight: new THREE.Color(0x00ff00), // green accents
  beat: new THREE.Color(0xffff33)     // bright yellow
};

// Lerp function
function lerp(a,b,t){ return a + (b-a)*t; }

// Mouse follow
let mouseX=0, mouseY=0;
document.addEventListener('mousemove',e=>{ mouseX=(e.clientX-window.innerWidth/2)/100; mouseY=(e.clientY-window.innerHeight/2)/100; });

// Animate loop
const clock = new THREE.Clock();
function animate(){
  const time = clock.getElapsedTime();
  const freq = analyser.getAverageFrequency();

  smoothedFreq = lerp(smoothedFreq, freq, FREQ_SMOOTH);
  uniforms.u_time.value = time;
  uniforms.u_frequency.value = smoothedFreq;

  // Beat detection
  averageFreq = beatDecayRate*averageFreq + (1-beatDecayRate)*smoothedFreq;
  if(smoothedFreq>averageFreq*beatThreshold && smoothedFreq>beatCutoff){
    isBeat=true; beatCutoff=smoothedFreq*1.1; beatFrameCounter=0; uniforms.u_beat.value=1.0;
  } else { if(beatFrameCounter<=beatHoldFrames){ beatFrameCounter++; } else { isBeat=false; beatCutoff*=0.97; } }
  uniforms.u_beat.value *= 0.92;

  // Halloween color mapping
  const freqNorm = Math.max(0, Math.min(1, smoothedFreq / 255.0));
  let targetColor = HalloweenColors.base.clone();
  if(smoothedFreq >= QUIET_THRESHOLD){
    if(isBeat){ targetColor.lerp(HalloweenColors.beat,0.8); }
    else{ targetColor.lerp(HalloweenColors.highlight, freqNorm*0.5); }
  }
  currentColor.r = lerp(currentColor.r,targetColor.r,COLOR_SMOOTH);
  currentColor.g = lerp(currentColor.g,targetColor.g,COLOR_SMOOTH);
  currentColor.b = lerp(currentColor.b,targetColor.b,COLOR_SMOOTH);

  uniforms.u_red.value = currentColor.r;
  uniforms.u_green.value = currentColor.g;
  uniforms.u_blue.value = currentColor.b;

  // Camera follow
  camera.position.x += (mouseX - camera.position.x) * 0.05;
  camera.position.y += (-mouseY - camera.position.y) * 0.05;
  camera.lookAt(scene.position);

  composer.render();
  requestAnimationFrame(animate);
}
animate();

// Window resize
window.addEventListener('resize',()=>{
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  composer.setSize(window.innerWidth,window.innerHeight);
});

// STL export
function fract(x){return x-Math.floor(x);}
function waveJS(x,type){if(type===0)return Math.sin(x); if(type===1)return Math.sign(Math.sin(x)); if(type===2)return (2/Math.PI)*Math.asin(Math.sin(x)); if(type===3){const t=fract(x/(2*Math.PI)); return 2*t-1;} return Math.sin(x);}
function deformGeometryCPU(geometry,time,frequency,beat,waveType){
  const posAttr=geometry.attributes.position;
  const normAttr=geometry.attributes.normal;
  for(let i=0;i<posAttr.count;i++){
    const x=posAttr.getX(i),y=posAttr.getY(i),z=posAttr.getZ(i);
    const nx=normAttr.getX(i),ny=normAttr.getY(i),nz=normAttr.getZ(i);
    const freqDisplacement=waveJS(y*5.0+time*3.0,waveType)*frequency*0.02;
    const distFromCenter=Math.hypot(x,y,z);
    const ripple=waveJS(distFromCenter*10.0-time*30.0,waveType)*beat*0.7;
    const displacement=freqDisplacement+ripple;
    posAttr.setXYZ(i,x+nx*displacement,y+ny*displacement,z+nz*displacement);
  }
  posAttr.needsUpdate=true;
  geometry.computeVertexNormals();
}
function exportSTL(){
  let activeMesh;
  if(meshWireframe.visible) activeMesh=meshWireframe;
  else if(meshSolid.visible) activeMesh=meshSolid;
  else return alert('STL export not available in Particle Cloud mode.');
  const clonedGeo=activeMesh.geometry.clone();
  deformGeometryCPU(clonedGeo,uniforms.u_time.value,uniforms.u_frequency.value,uniforms.u_beat.value,uniforms.u_waveType.value);
  const exportMesh=new THREE.Mesh(clonedGeo);
  const exporter=new STLExporter();
  const stlString=exporter.parse(exportMesh);
  const blob=new Blob([stlString],{type:'text/plain'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download='deformed_geometry.stl';
  link.click();
}
gui.add({exportSTL},'exportSTL').name('Export 3D Model');
