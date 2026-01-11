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
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Scene & Camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, -2, 14);
camera.lookAt(0, 0, 0);

// Song title overlay (bottom-right)
const songTitle = document.createElement('div');
songTitle.textContent = 'Loading audio...';
songTitle.style.position = 'absolute';
songTitle.style.bottom = '10px';
songTitle.style.right = '10px';
songTitle.style.color = 'white';
songTitle.style.fontFamily = 'Arial, sans-serif';
songTitle.style.fontSize = '14px';
songTitle.style.opacity = '0.85';
songTitle.style.pointerEvents = 'none';
document.body.appendChild(songTitle);

// Audio setup
const listener = new THREE.AudioListener();
camera.add(listener);
const sound = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();

// Load audio file dynamically
const audioFile = './C Moon.mp3'; // change path only
audioLoader.load(audioFile, (buffer) => {
  sound.setBuffer(buffer);
  sound.setLoop(true);
  sound.setVolume(0.5);

  // Update song overlay dynamically
  const filename = audioFile.split('/').pop();
  const displayName = filename.replace(/\.[^/.]+$/, "");
  songTitle.textContent = `Now Playing: ${displayName}`;

  window.addEventListener(
    'click',
    () => {
      if (!sound.isPlaying) sound.play();
    },
    { once: true }
  );
});

const analyser = new THREE.AudioAnalyser(sound, 128);

// Uniforms
const uniforms = {
  u_time: { value: 0.0 },
  u_frequency: { value: 0.0 },
  u_beat: { value: 0.0 },
  u_red: { value: 1.0 },
  u_green: { value: 1.0 },
  u_blue: { value: 1.0 },
  u_waveType: { value: 0 },
  u_rhythmPulse: { value: 0.0 }, // NEW: Rhythm-driven pulse multiplier
};

// Geometry options
const geometries = {
  Icosahedron: new THREE.IcosahedronGeometry(4, 30),
  Sphere: new THREE.SphereGeometry(4, 64, 64),
  Torus: new THREE.TorusKnotGeometry(3, 1, 200, 32),
  Cube: new THREE.BoxGeometry(6, 6, 6, 40, 40, 40),
  Octahedron: new THREE.OctahedronGeometry(4, 4),
  Dodecahedron: new THREE.DodecahedronGeometry(4, 3),
  Cone: new THREE.ConeGeometry(3.5, 8, 64, 64),
};

// Vertex shader
const vertexShader = `
uniform float u_time; 
uniform float u_frequency; 
uniform float u_beat;
uniform float u_rhythmPulse; 
uniform int u_waveType; 
varying vec3 vNormal; 
varying vec3 vPosition; 

float wave(float x) {
  if (u_waveType == 0) return sin(x);
  else if (u_waveType == 1) return sign(sin(x));
  else if (u_waveType == 2) return (2.0 / 3.14159265) * asin(sin(x));
  else if (u_waveType == 3) { float t = fract(x / (2.0 * 3.14159265)); return 2.0 * t - 1.0; }
  return sin(x);
}

void main() {
  vNormal = normal; 
  vPosition = position; 

  float freq = u_frequency * 0.02; 
  float pulse = u_beat + u_rhythmPulse; // rhythm-driven pulses
  float flowDisplacement = wave(position.y * 5.0 + u_time * 3.0) * freq * (1.0 + pulse); 

  float distFromCenter = length(position); 
  float ripple = wave(distFromCenter * 10.0 - u_time * 30.0) * pulse * 0.7; 

  vec3 newPosition = position + normal * (flowDisplacement + ripple); 
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0); 
}`;

// Fragment shader
const fragmentShader = `
uniform float u_red; 
uniform float u_green; 
uniform float u_blue; 
varying vec3 vNormal; 
varying vec3 vPosition; 
void main() { 
  gl_FragColor = vec4(u_red, u_green, u_blue, 1.0); 
}`;

// Particle shaders
const vertexShaderParticles = `
uniform float u_time; 
uniform float u_frequency; 
uniform float u_rhythmPulse; 
uniform int u_waveType; 
varying float vAlpha; 

float wave(float x) {
  if (u_waveType == 0) return sin(x); 
  else if (u_waveType == 1) return sign(sin(x)); 
  else if (u_waveType == 2) return (2.0 / 3.14159265) * asin(sin(x)); 
  else if (u_waveType == 3) { float t = fract(x / (2.0 * 3.14159265)); return 2.0 * t - 1; }
  return sin(x);
}

void main() {
  float freq = u_frequency * 0.02; 
  float pulse = u_rhythmPulse;
  float displacement = wave(position.y * 5.0 + u_time * 3.0) * freq * (1.0 + pulse);
  vec3 newPosition = position + normal * displacement;

  float size = 10.0 + 25.0 * (sin(u_time * 4.0 + position.y * 3.0) + pulse); 
  gl_PointSize = size; 

  vAlpha = 0.5 + 0.5 * sin(u_time + position.x + position.y); 
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0); 
}`;

const fragmentShaderParticles = `
uniform float u_red; 
uniform float u_green; 
uniform float u_blue; 
varying float vAlpha; 
void main() { 
  float dist = distance(gl_PointCoord, vec2(0.5)); 
  float alpha = smoothstep(0.5, 0.2, dist) * vAlpha; 
  gl_FragColor = vec4(u_red, u_green, u_blue, alpha); 
}`;

// Materials
const wireframeMat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, wireframe: true });
const solidMat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, wireframe: false });
const particleMat = new THREE.ShaderMaterial({ uniforms, vertexShader: vertexShaderParticles, fragmentShader: fragmentShaderParticles, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

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
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight));
bloomPass.threshold = 0.6;
bloomPass.strength = 0.4;
bloomPass.radius = 0.8;
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// GUI setup
const params = {
  red: 1.0,
  green: 1.0,
  blue: 1.0,
  threshold: 0.4,
  strength: 0.6,
  radius: 0.8,
  geometry: 'Icosahedron',
  colorTheme: 'White',
  bloom: true,
  displayMode: 'Wireframe',
  waveform: 'Sine',
};
const colorPresets = {
  White: { r: 1.0, g: 1.0, b: 1.0 },
  Neon: { r: 0.3, g: 1.0, b: 0.8 },
  Sunset: { r: 1.0, g: 0.4, b: 0.3 },
  Magenta: { r: 1.0, g: 0.1, b: 0.9 },
};
const gui = new GUI();
const colorsFolder = gui.addFolder('Colors');
colorsFolder.add(params, 'red', 0, 1).onChange(v => uniforms.u_red.value = v);
colorsFolder.add(params, 'green', 0, 1).onChange(v => uniforms.u_green.value = v);
colorsFolder.add(params, 'blue', 0, 1).onChange(v => uniforms.u_blue.value = v);
colorsFolder.open();

const bloomFolder = gui.addFolder('Bloom');
bloomFolder.add(params, 'threshold', 0, 1).onChange(v => bloomPass.threshold = v);
bloomFolder.add(params, 'strength', 0, 3).onChange(v => bloomPass.strength = v);
bloomFolder.add(params, 'radius', 0, 1).onChange(v => bloomPass.radius = v);
bloomFolder.open();

gui.add(params, 'geometry', Object.keys(geometries)).name('Geometry').onChange(name => {
  const newGeo = geometries[name].clone();
  meshWireframe.geometry.dispose();
  meshWireframe.geometry = newGeo.clone();
  meshSolid.geometry.dispose();
  meshSolid.geometry = newGeo.clone();
  points.geometry.dispose();
  points.geometry = newGeo.clone();
});

gui.add(params, 'colorTheme', Object.keys(colorPresets)).name('Color Theme').onChange(name => {
  const c = colorPresets[name];
  uniforms.u_red.value = c.r;
  uniforms.u_green.value = c.g;
  uniforms.u_blue.value = c.b;
  params.red = c.r;
  params.green = c.g;
  params.blue = c.b;
  colorsFolder.updateDisplay();
});

gui.add(params, 'bloom').name('Enable Bloom').onChange(enabled => {
  params.bloom = enabled;
  bloomPass.enabled = enabled && params.displayMode !== 'Particle Cloud';
});

gui.add(params, 'displayMode', ['Wireframe', 'Solid', 'Particle Cloud']).name('Display Mode').onChange(mode => {
  meshWireframe.visible = mode === 'Wireframe';
  meshSolid.visible = mode === 'Solid';
  points.visible = mode === 'Particle Cloud';
  bloomPass.enabled = mode !== 'Particle Cloud' && params.bloom;
});

const waveformMap = { 'Sine': 0, 'Square': 1, 'Triangle': 2, 'Sawtooth': 3 };
gui.add(params, 'waveform', Object.keys(waveformMap)).name('Waveform Type').onChange(name => {
  uniforms.u_waveType.value = waveformMap[name];
});

// STL Export function
function fract(x) { return x - Math.floor(x); }
function waveJS(x, type) {
  if (type === 0) return Math.sin(x); 
  if (type === 1) return Math.sign(Math.sin(x)); 
  if (type === 2) return (2 / Math.PI) * Math.asin(Math.sin(x)); 
  if (type === 3) { const t = fract(x / (2 * Math.PI)); return 2 * t - 1; }
  return Math.sin(x);
}
function deformGeometryCPU(geometry, time, frequency, beat, waveType, rhythmPulse) {
  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);

    const freqDisplacement = waveJS(y * 5.0 + time * 3.0, waveType) * frequency * 0.02 * (1 + rhythmPulse);
    const distFromCenter = Math.hypot(x, y, z);
    const ripple = waveJS(distFromCenter * 10.0 - time * 30.0, waveType) * (beat + rhythmPulse) * 0.7;

    const displacement = freqDisplacement + ripple;
    posAttr.setXYZ(i, x + nx * displacement, y + ny * displacement, z + nz * displacement);
  }
  posAttr.needsUpdate = true;
  geometry.computeVertexNormals();
}
function exportSTL() {
  let activeMesh;
  if (meshWireframe.visible) activeMesh = meshWireframe;
  else if (meshSolid.visible) activeMesh = meshSolid;
  else return alert('STL export not available in Particle Cloud mode.');

  const clonedGeo = activeMesh.geometry.clone();
  deformGeometryCPU(clonedGeo, uniforms.u_time.value, uniforms.u_frequency.value, uniforms.u_beat.value, uniforms.u_waveType.value, uniforms.u_rhythmPulse.value);
  const exportMesh = new THREE.Mesh(clonedGeo);
  const exporter = new STLExporter();
  const stlString = exporter.parse(exportMesh);
  const blob = new Blob([stlString], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${params.geometry}_${params.waveform}_${Date.now()}.stl`;
  link.click();
}
gui.add({ exportSTL }, 'exportSTL').name('Export 3D Model');

// Beat Detection (Rhythm-driven Pulse)
let beatThreshold = 1.15;
let beatHoldFrames = 15;
let beatDecayRate = 0.98;
let beatCutoff = 0;
let beatFrameCounter = 0;
let isBeat = false;
let averageFreq = 0;

// Mouse move for camera
let mouseX = 0, mouseY = 0;
document.addEventListener('mousemove', e => {
  mouseX = (e.clientX - window.innerWidth / 2) / 100;
  mouseY = (e.clientY - window.innerHeight / 2) / 100;
});

// Animate
const clock = new THREE.Clock();
function animate() {
  camera.position.x += (mouseX - camera.position.x) * 0.05;
  camera.position.y += (-mouseY - camera.position.y) * 0.05;
  camera.lookAt(scene.position);

  const time = clock.getElapsedTime();
  const freq = analyser.getAverageFrequency();
  uniforms.u_time.value = time;
  uniforms.u_frequency.value = freq;

  // Beat detection
  averageFreq = beatDecayRate * averageFreq + (1 - beatDecayRate) * freq;
  if (freq > averageFreq * beatThreshold && freq > beatCutoff) {
    isBeat = true;
    beatCutoff = freq * 1.1;
    beatFrameCounter = 0;
    uniforms.u_beat.value = 1.0;
    uniforms.u_rhythmPulse.value = 1.0; // Rhythm pulse triggered
  } else {
    if (beatFrameCounter <= beatHoldFrames) beatFrameCounter++;
    else isBeat = false;
  }

  // Decay
  uniforms.u_beat.value *= 0.92;
  uniforms.u_rhythmPulse.value *= 0.9; // Decay rhythm-driven pulse

  // Optional: scale mesh on beat
  const scalePulse = 1 + uniforms.u_rhythmPulse.value * 0.15;
  meshWireframe.scale.setScalar(scalePulse);
  meshSolid.scale.setScalar(scalePulse);
  points.scale.setScalar(scalePulse);

  composer.render();
  requestAnimationFrame(animate);
}
animate();

// Handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
