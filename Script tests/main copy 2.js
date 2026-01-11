// Full updated Three.js visualizer with GPU multi-band wave-like deformation
// Preserves: GUI, geometry selector, particle cloud, bloom toggle, STL export, mic/file input, beat detection, color smoothing, geometry scaling
// Adds: Multi-band (bass/mids/treble) wave-like deformation in shaders + CPU deformation for STL export

import * as THREE from 'three';
import { GUI } from 'lil-gui';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ---------- Scene & Camera ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, -2, 14);
camera.lookAt(0, 0, 0);

// ---------- Song Title Overlay ----------
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

// ---------- Audio Setup ----------
const listener = new THREE.AudioListener();
camera.add(listener);

let sound = new THREE.Audio(listener);
let analyser = new THREE.AudioAnalyser(sound, 128);
const audioLoader = new THREE.AudioLoader();

function setupAnalyser() {
  analyser = new THREE.AudioAnalyser(sound, 128);
}

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
      sound.setVolume(0.5);
      setupAnalyser();

      const displayName = file.name.replace(/\.[^/.]+$/, '');
      songTitle.textContent = `Now Playing: ${displayName}`;

      // Start on first user interaction (for autoplay restrictions)
      window.addEventListener(
        'click',
        () => {
          if (!sound.isPlaying) sound.play();
        },
        { once: true }
      );
    }, undefined, (err) => {
      console.error('Audio load error', err);
      alert('Failed to load audio file.');
    });
  };
  reader.readAsDataURL(file);
});

// ---------- Uniforms (extended for multi-band) ----------
const uniforms = {
  u_time: { value: 0.0 },
  u_frequency: { value: 0.0 }, // smoothed average frequency (for legacy usage)
  u_beat: { value: 0.0 },

  // new band uniforms (0..1)
  u_bass: { value: 0.0 },
  u_mids: { value: 0.0 },
  u_treble: { value: 0.0 },

  u_red: { value: 1.0 },
  u_green: { value: 1.0 },
  u_blue: { value: 1.0 },

  u_waveType: { value: 0 }
};

// ---------- Geometries ----------
const geometries = {
  Icosahedron: new THREE.IcosahedronGeometry(3, 20),
  Sphere: new THREE.SphereGeometry(3, 64, 64),
  Torus: new THREE.TorusKnotGeometry(2.5, 1, 200, 32),
  Cube: new THREE.BoxGeometry(6, 6, 6, 40, 40, 40),
  Octahedron: new THREE.OctahedronGeometry(4, 4),
  Dodecahedron: new THREE.DodecahedronGeometry(4, 3),
  Cone: new THREE.ConeGeometry(3.5, 8, 64, 64),
};

// ---------- Shaders (vertex uses multi-band waves) ----------
const vertexShader = `
uniform float u_time;
uniform float u_frequency;
uniform float u_beat;
uniform float u_bass;
uniform float u_mids;
uniform float u_treble;
uniform int u_waveType;
varying vec3 vNormal;
varying vec3 vPosition;

float waveFunc(float x){
  if(u_waveType==0) return sin(x);
  else if(u_waveType==1) return sign(sin(x));
  else if(u_waveType==2) return (2.0/3.14159265)*asin(sin(x));
  else if(u_waveType==3){
    float t = fract(x/(2.0*3.14159265));
    return 2.0*t - 1.0;
  }
  return sin(x);
}

void main(){
  vNormal = normal;
  vPosition = position;

  float dist = length(position);

  // Bass: large slow waves
  float bassWave = waveFunc(dist * 1.8 - u_time * 1.2) * u_bass * 0.9;

  // Mids: medium frequency waves
  float midWave = waveFunc(dist * 5.2 - u_time * 2.2) * u_mids * 0.45;

  // Treble: fine fast ripples
  float trebleWave = waveFunc(dist * 12.0 - u_time * 4.0) * u_treble * 0.18;

  // Beat ripple (short pulse)
  float beatRipple = waveFunc(dist * 10.0 - u_time * 30.0) * u_beat * 0.7;

  // Frequency-driven flow displacement (legacy-style)
  float freqFlow = waveFunc(position.y * 5.0 + u_time * 3.0) * (u_frequency * 0.02);

  float totalDisplacement = bassWave + midWave + trebleWave + beatRipple + freqFlow;

  vec3 newPosition = position + normal * totalDisplacement;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const fragmentShader = `
uniform float u_red;
uniform float u_green;
uniform float u_blue;
varying vec3 vNormal;
varying vec3 vPosition;

void main(){
  gl_FragColor = vec4(u_red, u_green, u_blue, 1.0);
}
`;

const vertexShaderParticles = `
uniform float u_time;
uniform float u_frequency;
uniform float u_bass;
uniform float u_mids;
uniform float u_treble;
uniform int u_waveType;
varying float vAlpha;

float waveFunc(float x){
  if(u_waveType==0) return sin(x);
  else if(u_waveType==1) return sign(sin(x));
  else if(u_waveType==2) return (2.0/3.14159265)*asin(sin(x));
  else if(u_waveType==3){
    float t = fract(x/(2.0*3.14159265));
    return 2.0*t - 1.0;
  }
  return sin(x);
}

void main(){
  float dist = length(position);
  float bassWave = waveFunc(dist * 1.8 - u_time * 1.2) * u_bass * 0.9;
  float midWave = waveFunc(dist * 5.2 - u_time * 2.2) * u_mids * 0.45;
  float trebleWave = waveFunc(dist * 12.0 - u_time * 4.0) * u_treble * 0.18;
  float freqFlow = waveFunc(position.y * 5.0 + u_time * 3.0) * (u_frequency * 0.02);
  vec3 newPosition = position + normal * (bassWave + midWave + trebleWave + freqFlow);

  float pulse = 10.0 + 25.0 * sin(u_time*4.0 + position.y*3.0) * (0.5 + u_bass);
  gl_PointSize = pulse;

  vAlpha = 0.5 + 0.5 * sin(u_time + position.x + position.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const fragmentShaderParticles = `
uniform float u_red;
uniform float u_green;
uniform float u_blue;
varying float vAlpha;

void main(){
  float dist = distance(gl_PointCoord, vec2(0.5));
  float alpha = smoothstep(0.5, 0.2, dist) * vAlpha;
  gl_FragColor = vec4(u_red, u_green, u_blue, alpha);
}
`;

// ---------- Materials & Meshes ----------
const wireframeMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader,
  wireframe: true
});
const solidMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader,
  wireframe: false
});
const particleMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: vertexShaderParticles,
  fragmentShader: fragmentShaderParticles,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending
});

const defaultGeometry = geometries.Icosahedron.clone();
const meshWireframe = new THREE.Mesh(defaultGeometry.clone(), wireframeMat);
const meshSolid = new THREE.Mesh(defaultGeometry.clone(), solidMat);
const points = new THREE.Points(defaultGeometry.clone(), particleMat);
scene.add(meshWireframe, meshSolid, points);
meshSolid.visible = false;
points.visible = false;

// ---------- Postprocessing ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight));
bloomPass.threshold = 0.6;
bloomPass.strength = 0.4;
bloomPass.radius = 0.8;
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ---------- GUI ----------
const params = {
  threshold: 0.6, strength: 0.4, radius: 0.8,
  geometry: 'Icosahedron',
  bloom: true,
  displayMode: 'Wireframe',
  audioSource: 'MP3 File',
  waveType: 0,
  scaleIntensity: 0.008,
  distortion: 1.0
};

const gui = new GUI();

// Audio Source Selector
const audioSources = { 'MP3 File': 'file', 'Microphone': 'mic' };
gui.add({ source: 'file' }, 'source', Object.keys(audioSources)).name('Audio Source').onChange(async (value) => {
  if (audioSources[value] === 'file') {
    fileInput.click();
  } else if (audioSources[value] === 'mic') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = listener.context;
      const src = audioContext.createMediaStreamSource(stream);

      const dummyGain = audioContext.createGain();
      dummyGain.gain.value = 0;
      src.connect(dummyGain);
      dummyGain.connect(audioContext.destination);

      sound = new THREE.Audio(listener);
      sound.setNodeSource(src);
      setupAnalyser();

      songTitle.textContent = 'Live: Microphone Input';
    } catch (err) {
      alert('Microphone access denied: ' + err.message);
    }
  }
});

// Bloom controls
const bloomFolder = gui.addFolder('Bloom');
bloomFolder.add(params, 'threshold', 0, 1).onChange(v => bloomPass.threshold = v);
bloomFolder.add(params, 'strength', 0, 3).onChange(v => bloomPass.strength = v);
bloomFolder.add(params, 'radius', 0, 1).onChange(v => bloomPass.radius = v);
bloomFolder.open();

// Geometry & display
gui.add(params, 'geometry', Object.keys(geometries)).name('Geometry').onChange(name => {
  const newGeo = geometries[name].clone();
  meshWireframe.geometry.dispose(); meshWireframe.geometry = newGeo.clone();
  meshSolid.geometry.dispose(); meshSolid.geometry = newGeo.clone();
  points.geometry.dispose(); points.geometry = newGeo.clone();
});
gui.add(params, 'bloom').name('Enable Bloom').onChange(enabled => {
  bloomPass.enabled = enabled && params.displayMode !== 'Particle Cloud';
});
gui.add(params, 'displayMode', ['Wireframe', 'Solid', 'Particle Cloud']).name('Display Mode').onChange(mode => {
  meshWireframe.visible = mode === 'Wireframe';
  meshSolid.visible = mode === 'Solid';
  points.visible = mode === 'Particle Cloud';
  bloomPass.enabled = mode !== 'Particle Cloud' && params.bloom;
});

gui.add(params, 'waveType', { Sine: 0, Square: 1, Triangle: 2, Saw: 3 }).name('Wave Type').onChange(v => {
  uniforms.u_waveType.value = v;
});

gui.add(params, 'scaleIntensity', 0.000, 0.02, 0.0001).name('Scale Intensity');
gui.add(params, 'distortion', 0.0, 2.0, 0.01).name('Global Distortion');

// ---------- STL/3D Model Export (CPU deformation uses same band logic) ----------
function fract(x) { return x - Math.floor(x); }
function waveJS(x, type) {
  if (type === 0) return Math.sin(x);
  if (type === 1) return Math.sign(Math.sin(x));
  if (type === 2) return (2 / Math.PI) * Math.asin(Math.sin(x));
  if (type === 3) {
    const t = fract(x / (2 * Math.PI));
    return 2 * t - 1;
  }
  return Math.sin(x);
}

// CPU deform using band amplitudes -> used for STL export to match GPU deformation
function deformGeometryCPU(geometry, time, frequency, beat, bass, mids, treble, waveType, globalDistortion) {
  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  // create arrays copies to read original positions (so deformation is relative)
  const original = posAttr.array.slice(); // copy
  for (let i = 0; i < posAttr.count; i++) {
    const ix = i * 3;
    const x = original[ix], y = original[ix + 1], z = original[ix + 2];
    const nx = normAttr.getX(i), ny = normAttr.getY(i), nz = normAttr.getZ(i);

    const dist = Math.hypot(x, y, z);

    const bassWave = waveJS(dist * 1.8 - time * 1.2, waveType) * bass * 0.9;
    const midWave = waveJS(dist * 5.2 - time * 2.2, waveType) * mids * 0.45;
    const trebleWave = waveJS(dist * 12.0 - time * 4.0, waveType) * treble * 0.18;

    const beatRipple = waveJS(dist * 10.0 - time * 30.0, waveType) * beat * 0.7;
    const freqFlow = waveJS(y * 5.0 + time * 3.0, waveType) * (frequency * 0.02);

    const total = (bassWave + midWave + trebleWave + beatRipple + freqFlow) * globalDistortion;

    posAttr.setXYZ(i, x + nx * total, y + ny * total, z + nz * total);
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
  // read uniform values (bands are 0..1)
  const t = uniforms.u_time.value;
  const freq = uniforms.u_frequency.value;
  const beat = uniforms.u_beat.value;
  const bass = uniforms.u_bass.value;
  const mids = uniforms.u_mids.value;
  const treble = uniforms.u_treble.value;
  const waveType = uniforms.u_waveType.value;
  const globalDistortion = params.distortion;

  deformGeometryCPU(clonedGeo, t, freq, beat, bass, mids, treble, waveType, globalDistortion);

  const exportMesh = new THREE.Mesh(clonedGeo);
  const exporter = new STLExporter();
  const stlString = exporter.parse(exportMesh);
  const blob = new Blob([stlString], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'deformed_geometry.stl';
  link.click();
}
gui.add({ exportSTL }, 'exportSTL').name('Export 3D Model');

// ---------- Beat Detection ----------
let beatThreshold = 1.15, beatHoldFrames = 15, beatDecayRate = 0.98, beatCutoff = 0, beatFrameCounter = 0, isBeat = false, averageFreq = 0;

// ---------- Color-from-frequency smoothing state ----------
let smoothedFreq = 0.0;         // smoothed average frequency (0..~255)
const FREQ_SMOOTH = 0.08;       // lerp factor for frequency smoothing (0..1)
let currentColor = { r: 1, g: 1, b: 1 }; // white by default
const COLOR_SMOOTH = 0.06;      // lerp factor for color smoothing (0..1)
const QUIET_THRESHOLD = 6.0;    // below this freq threshold is idle and transitions back to white

// lerp
function lerp(a, b, t) { return a + (b - a) * t; }

// ---------- Mouse Camera Follow ----------
let mouseX = 0, mouseY = 0;
document.addEventListener('mousemove', e => {
  mouseX = (e.clientX - window.innerWidth / 2) / 100;
  mouseY = (e.clientY - window.innerHeight / 2) / 100;
});

// ---------- Animate ----------
const clock = new THREE.Clock();

// for frequency band smoothing
let smBass = 0, smMids = 0, smTreble = 0;
const BAND_SMOOTH = 0.12;

function getBandAverage(freqArray, startIdx, endIdx) {
  let sum = 0;
  const len = Math.max(1, endIdx - startIdx);
  for (let i = startIdx; i < endIdx; i++) sum += freqArray[i];
  return sum / len;
}

function animate() {
  // Camera follow around mouse orbit
  camera.position.x += (mouseX - camera.position.x) * 0.05;
  camera.position.y += (-mouseY - camera.position.y) * 0.05;
  camera.lookAt(scene.position);

  const time = clock.getElapsedTime();
  uniforms.u_time.value = time;

  // Get frequency data from analyser
  // THREE.AudioAnalyser has getFrequencyData() returning array length 128
  const freqData = analyser.getFrequencyData(); // returns Uint8Array
  // Average frequency (legacy)
  const avgFreq = analyser.getAverageFrequency();
  // Smooth average frequency
  smoothedFreq = lerp(smoothedFreq, avgFreq, FREQ_SMOOTH);
  uniforms.u_frequency.value = smoothedFreq;

  // Multi-band ranges (adjustable if needed)
  // With 128 bins: 0..127
  const bassAvg = getBandAverage(freqData, 0, 16);     // ~lowest 16 bins
  const midsAvg = getBandAverage(freqData, 16, 64);    // ~mid bins
  const trebleAvg = getBandAverage(freqData, 64, freqData.length); // highs

  // Normalize to 0..1
  const bassNorm = Math.max(0, Math.min(1, bassAvg / 255));
  const midsNorm = Math.max(0, Math.min(1, midsAvg / 255));
  const trebleNorm = Math.max(0, Math.min(1, trebleAvg / 255));

  // Smooth band values
  smBass = lerp(smBass, bassNorm, BAND_SMOOTH);
  smMids = lerp(smMids, midsNorm, BAND_SMOOTH);
  smTreble = lerp(smTreble, trebleNorm, BAND_SMOOTH);

  // Update band uniforms
  uniforms.u_bass.value = smBass;
  uniforms.u_mids.value = smMids;
  uniforms.u_treble.value = smTreble;

  // Beat detection (based on smoothedFreq)
  averageFreq = beatDecayRate * averageFreq + (1 - beatDecayRate) * smoothedFreq;
  if (smoothedFreq > averageFreq * beatThreshold && smoothedFreq > beatCutoff) {
    isBeat = true;
    beatCutoff = smoothedFreq * 1.1;
    beatFrameCounter = 0;
    uniforms.u_beat.value = 1.0;
  } else {
    if (beatFrameCounter <= beatHoldFrames) { beatFrameCounter++; }
    else { isBeat = false; beatCutoff *= 0.97; }
  }
  // decay beat uniform
  uniforms.u_beat.value *= 0.92;

  // Geometry scaling based on overall smoothed frequency
  const scaleBase = 1.0;
  const scaleIntensity = params.scaleIntensity; // sensitivity param
  const targetScale = scaleBase + smoothedFreq * scaleIntensity;
  const smoothScale = lerp(meshWireframe.scale.x, targetScale, 0.1);
  meshWireframe.scale.setScalar(smoothScale);
  meshSolid.scale.setScalar(smoothScale);
  points.scale.setScalar(smoothScale);

  // Color transitions using smoothedFreq
  const freqNorm = Math.max(0, Math.min(1, smoothedFreq / 255.0));
  let targetRGB = [1, 1, 1]; // default white
  if (smoothedFreq >= QUIET_THRESHOLD) {
    const hue = (freqNorm * 0.95) % 1.0;
    const saturation = 0.9;
    const lightness = 0.5 + 0.25 * freqNorm;
    const tmp = new THREE.Color();
    tmp.setHSL(hue, saturation, lightness);
    targetRGB = [tmp.r, tmp.g, tmp.b];
  }
  currentColor.r = lerp(currentColor.r, targetRGB[0], COLOR_SMOOTH);
  currentColor.g = lerp(currentColor.g, targetRGB[1], COLOR_SMOOTH);
  currentColor.b = lerp(currentColor.b, targetRGB[2], COLOR_SMOOTH);
  uniforms.u_red.value = currentColor.r;
  uniforms.u_green.value = currentColor.g;
  uniforms.u_blue.value = currentColor.b;

  // Ensure bloom enabled state matches GUI + particle mode
  bloomPass.enabled = params.bloom && params.displayMode !== 'Particle Cloud';

  // Render with composer
  composer.render();

  requestAnimationFrame(animate);
}
animate();

// ---------- Window Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- End of Script ----------
