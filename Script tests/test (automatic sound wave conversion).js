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

// Song title overlay
const songTitle = document.createElement('div');
songTitle.textContent = 'Now Playing: Get it by your hands';
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
audioLoader.load('./Get it by your hands.mp3', (buffer) => {
  sound.setBuffer(buffer);
  sound.setLoop(true);
  sound.setVolume(0.5);
  window.addEventListener('click', () => { if (!sound.isPlaying) sound.play(); }, { once: true });
});
const analyser = new THREE.AudioAnalyser(sound, 256); // finer spectrum

// Uniforms
const uniforms = {
  u_time: { value: 0.0 },
  u_frequency: { value: 0.0 },
  u_beat: { value: 0.0 },
  u_red: { value: 1.0 },
  u_green: { value: 1.0 },
  u_blue: { value: 1.0 },
  u_weights: { value: new THREE.Vector4(1, 0, 0, 0) } // sine, square, tri, saw
};

// Geometry options
const geometries = {
  Icosahedron: new THREE.IcosahedronGeometry(4, 30), // reduced detail for perf
  Sphere: new THREE.SphereGeometry(4, 64, 64),
  Torus: new THREE.TorusKnotGeometry(3, 1, 200, 32),
  Cube: new THREE.BoxGeometry(6, 6, 6, 40, 40, 40),
  Octahedron: new THREE.OctahedronGeometry(4, 4),
  Dodecahedron: new THREE.DodecahedronGeometry(4, 3),
  Cone: new THREE.ConeGeometry(3.5, 8, 64, 64),
};

// Vertex shader with waveform blending
const vertexShader = `
uniform float u_time; 
uniform float u_frequency; 
uniform float u_beat; 
uniform vec4 u_weights; 
varying vec3 vNormal; 
varying vec3 vPosition; 

float sineWave(float x) { return sin(x); }
float squareWave(float x) { return sign(sin(x)); }
float triWave(float x) { return (2.0 / 3.14159265) * asin(sin(x)); }
float sawWave(float x) { float t = fract(x / (2.0 * 3.14159265)); return 2.0 * t - 1.0; }

float blendedWave(float x) {
  float sine = sineWave(x);
  float square = squareWave(x);
  float tri = triWave(x);
  float saw = sawWave(x);
  return sine * u_weights.x + square * u_weights.y + tri * u_weights.z + saw * u_weights.w;
}

void main() {
  vNormal = normal; 
  vPosition = position; 

  float freq = u_frequency * 0.02; 
  float flowDisplacement = blendedWave(position.y * 5.0 + u_time * 3.0) * freq; 

  float distFromCenter = length(position); 
  float ripple = blendedWave(distFromCenter * 10.0 - u_time * 30.0) * u_beat * 0.7; 

  vec3 newPosition = position + normal * (flowDisplacement + ripple); 
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0); 
}`;

// Fragment shader
const fragmentShader = `
uniform float u_red; 
uniform float u_green; 
uniform float u_blue; 
void main() { 
  gl_FragColor = vec4(u_red, u_green, u_blue, 1.0); 
}`;

// Particle shaders (use same blended wave)
const vertexShaderParticles = `
uniform float u_time; 
uniform float u_frequency; 
uniform vec4 u_weights;
varying float vAlpha; 

float sineWave(float x) { return sin(x); }
float squareWave(float x) { return sign(sin(x)); }
float triWave(float x) { return (2.0 / 3.14159265) * asin(sin(x)); }
float sawWave(float x) { float t = fract(x / (2.0 * 3.14159265)); return 2.0 * t - 1.0; }

float blendedWave(float x) {
  float sine = sineWave(x);
  float square = squareWave(x);
  float tri = triWave(x);
  float saw = sawWave(x);
  return sine * u_weights.x + square * u_weights.y + tri * u_weights.z + saw * u_weights.w;
}

void main() {
  float freq = u_frequency * 0.02; 
  float displacement = blendedWave(position.y * 5.0 + u_time * 3.0) * freq; 
  vec3 newPosition = position + normal * displacement; 

  float pulse = 5.0 + 20.0 * sin(u_time * 4.0 + position.y * 3.0); 
  gl_PointSize = pulse; 

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

// GUI
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
  displayMode: 'Wireframe'
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
  meshWireframe.geometry.dispose?.();
  meshWireframe.geometry = newGeo.clone();
  meshSolid.geometry.dispose?.();
  meshSolid.geometry = newGeo.clone();
  points.geometry.dispose?.();
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

// Beat Detection
let beatThreshold = 1.15;
let beatHoldFrames = 15;
let beatDecayRate = 0.98;
let beatCutoff = 0;
let beatFrameCounter = 0;
let averageFreq = 0;

// Mouse move
let mouseX = 0, mouseY = 0;
document.addEventListener('mousemove', e => {
  mouseX = (e.clientX - window.innerWidth / 2) / 100;
  mouseY = (e.clientY - window.innerHeight / 2) / 100;
});

// Animate loop
const clock = new THREE.Clock();
function animate() {
  // Smooth camera follow
  camera.position.x += (mouseX - camera.position.x) * 0.05;
  camera.position.y += (-mouseY - camera.position.y) * 0.05;
  camera.lookAt(scene.position);

  const time = clock.getElapsedTime();
  const freq = analyser.getAverageFrequency();
  const data = analyser.getFrequencyData();

  uniforms.u_time.value = time;
  uniforms.u_frequency.value = freq;

  // Beat detection
  averageFreq = beatDecayRate * averageFreq + (1 - beatDecayRate) * freq;
  if (freq > averageFreq * beatThreshold && freq > beatCutoff) {
    beatCutoff = freq * 1.1;
    beatFrameCounter = 0;
    uniforms.u_beat.value = 1.0;
  } else {
    if (beatFrameCounter <= beatHoldFrames) {
      beatFrameCounter++;
    } else {
      beatCutoff *= 0.97;
    }
  }
  uniforms.u_beat.value *= 0.92;

  // --- Compute spectral bands for waveform blending ---
  const bass = data.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
  const mids = data.slice(20, 80).reduce((a, b) => a + b, 0) / 60;
  const highs = data.slice(80).reduce((a, b) => a + b, 0) / (data.length - 80);

  const sum = bass + mids + highs + 0.0001;
  const wSine = bass / sum;
  const wTri = mids / sum;
  const wSaw = highs / sum;
  const wSquare = uniforms.u_beat.value; // emphasize square on beats

  uniforms.u_weights.value.set(wSine, wSquare, wTri, wSaw);

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
