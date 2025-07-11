import * as THREE from 'three';
import { GUI } from 'lil-gui';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, -2, 14);
camera.lookAt(0, 0, 0);

// Audio - insert mp3 music file
const listener = new THREE.AudioListener();
camera.add(listener);
const sound = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();
audioLoader.load('./Get it by your hands HI-EVO MIX.mp3', (buffer) => {
  sound.setBuffer(buffer);
  sound.setLoop(true);
  sound.setVolume(0.5);
  window.addEventListener('click', () => sound.play());
});
const analyser = new THREE.AudioAnalyser(sound, 32);

// Uniforms - audio frequency and colour attributes 
const uniforms = {
  u_time: { value: 0.0 },
  u_frequency: { value: 0.0 },
  u_red: { value: 1.0 },
  u_green: { value: 1.0 },
  u_blue: { value: 1.0 },
};

// Geometry
const geometries = {
  Icosahedron: new THREE.IcosahedronGeometry(4, 30),
  Sphere: new THREE.SphereGeometry(4, 64, 64),
  Torus: new THREE.TorusKnotGeometry(3, 1, 200, 32),
};

// Shaders for wireframe and solid
const vertexShader = `
uniform float u_time;
uniform float u_frequency;
varying vec3 vNormal;
varying vec3 vPosition;
void main() {
  vNormal = normal;
  vPosition = position;
  float freq = u_frequency * 0.01;
  float displacement = sin(position.y * 5.0 + u_time * 2.0) * freq;
  vec3 newPosition = position + normal * displacement;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const fragmentShader = `
uniform float u_red;
uniform float u_green;
uniform float u_blue;
varying vec3 vNormal;
varying vec3 vPosition;
void main() {
  gl_FragColor = vec4(u_red, u_green, u_blue, 1.0);
}
`;

// Shaders for particles
const vertexShaderParticles = `
uniform float u_time;
uniform float u_frequency;
varying float vAlpha;
void main() {
  float freq = u_frequency * 0.01;
  float displacement = sin(position.y * 5.0 + u_time * 2.0) * freq;
  vec3 newPosition = position + normal * displacement;
  float pulse = 10.0 + 20.0 * sin(u_time * 3.0 + position.y * 2.0);
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
void main() {
  float dist = distance(gl_PointCoord, vec2(0.5));
  float alpha = smoothstep(0.5, 0.2, dist) * vAlpha;
  gl_FragColor = vec4(u_red, u_green, u_blue, alpha);
}
`;

// Materials
const wireframeMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader,
  wireframe: true,
});

const solidMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader,
  wireframe: false,
});

const particleMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: vertexShaderParticles,
  fragmentShader: fragmentShaderParticles,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

// Meshes
const defaultGeometry = geometries.Icosahedron.clone();
const meshWireframe = new THREE.Mesh(defaultGeometry.clone(), wireframeMat);
const meshSolid = new THREE.Mesh(defaultGeometry.clone(), solidMat);
const points = new THREE.Points(defaultGeometry.clone(), particleMat);

scene.add(meshWireframe);
scene.add(meshSolid);
scene.add(points);

meshSolid.visible = false;
points.visible = false;

// Postprocessing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight));
bloomPass.threshold = 0.5;
bloomPass.strength = 0.5;
bloomPass.radius = 0.8;
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// GUI setup
const params = {
  red: 1.0,
  green: 1.0,
  blue: 1.0,
  threshold: 0.5,
  strength: 0.5,
  radius: 0.8,
  geometry: 'Icosahedron',
  colorTheme: 'White',
  bloom: true,
  displayMode: 'Wireframe',
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

gui.add(params, 'bloom').name('Enable Bloom').onChange(enabled => bloomPass.enabled = enabled);

gui.add(params, 'displayMode', ['Wireframe', 'Solid', 'Particle Cloud']).name('Display Mode').onChange(mode => {
  meshWireframe.visible = mode === 'Wireframe';
  meshSolid.visible = mode === 'Solid';
  points.visible = mode === 'Particle Cloud';
});

// STL export functionality
function deformGeometryCPU(geometry, time, frequency) {
  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  for (let i = 0; i < posAttr.count; i++) {
	const x = posAttr.getX(i);
	const y = posAttr.getY(i);
	const z = posAttr.getZ(i);
	const nx = normAttr.getX(i);
	const ny = normAttr.getY(i);
	const nz = normAttr.getZ(i);
	const displacement = Math.sin(y * 5.0 + time * 2.0) * frequency * 0.01;
	posAttr.setXYZ(i, x + nx * displacement, y + ny * displacement, z + nz * displacement);
  }
  posAttr.needsUpdate = true;
  geometry.computeVertexNormals();
}

function exportSTL() {
  let activeMesh;
  if (meshWireframe.visible) activeMesh = meshWireframe;
  else if (meshSolid.visible) activeMesh = meshSolid;
  else {
	alert("Particle Cloud export not supported.");
	return;
  }

  const clonedGeo = activeMesh.geometry.clone();
  deformGeometryCPU(clonedGeo, uniforms.u_time.value, uniforms.u_frequency.value);
  const exportMesh = new THREE.Mesh(clonedGeo);
  const exporter = new STLExporter();
  const stlString = exporter.parse(exportMesh);
  const blob = new Blob([stlString], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'deformed_geometry.stl';
  link.click();
}

gui.add({ exportSTL }, 'exportSTL').name('Export STL');

// Mouse move camera
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

  uniforms.u_time.value = clock.getElapsedTime();
  uniforms.u_frequency.value = analyser.getAverageFrequency();

  composer.render();
  requestAnimationFrame(animate);
}
animate();

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
