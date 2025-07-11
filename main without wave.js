import * as THREE from 'three';
import { GUI } from 'lil-gui';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, -2, 14);
camera.lookAt(0, 0, 0);

// Audio setup
const listener = new THREE.AudioListener();
camera.add(listener);
const sound = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();
audioLoader.load('./Get it by your hands HI-EVO MIX.mp3', function (buffer) {
	sound.setBuffer(buffer);
	sound.setLoop(true);
	sound.setVolume(0.5);
	window.addEventListener('click', () => sound.play());
});
const analyser = new THREE.AudioAnalyser(sound, 32);

// Shader uniforms
const uniforms = {
	u_time: { value: 0.0 },
	u_frequency: { value: 0.0 },
	u_red: { value: 1.0 },
	u_green: { value: 1.0 },
	u_blue: { value: 1.0 },
	u_pointSize: { value: 5.0 },
};

// Vertex + fragment shaders for wave effect
const vertexShader = `
uniform float u_time;
uniform float u_frequency;

void main() {
	vec3 newPosition = position + normal * (u_frequency * 0.05);
	gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const fragmentShader = `
uniform float u_red;
uniform float u_green;
uniform float u_blue;

void main() {
	gl_FragColor = vec4(u_red, u_green, u_blue, 1.0);
}
`;

const pointVertexShader = `
uniform float u_frequency;
uniform float u_pointSize;

void main() {
	vec3 newPosition = position + normal * (u_frequency * 0.05);
	gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
	gl_PointSize = u_pointSize;
}
`;

const pointFragmentShader = `
uniform float u_red;
uniform float u_green;
uniform float u_blue;

void main() {
	float d = distance(gl_PointCoord, vec2(0.5));
	if (d > 0.5) discard;
	gl_FragColor = vec4(u_red, u_green, u_blue, 1.0);
}
`;

// Geometry
const geometries = {
	Icosahedron: new THREE.IcosahedronGeometry(4, 30),
	Sphere: new THREE.SphereGeometry(4, 64, 64),
	Torus: new THREE.TorusKnotGeometry(3, 1, 200, 32),
};

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

const pointsMat = new THREE.ShaderMaterial({
	uniforms,
	vertexShader: pointVertexShader,
	fragmentShader: pointFragmentShader,
	transparent: true,
	depthWrite: false,
});

// Meshes
const mesh = new THREE.Mesh(geometries.Icosahedron.clone(), wireframeMat);
const meshSolid = new THREE.Mesh(geometries.Icosahedron.clone(), solidMat);
const points = new THREE.Points(geometries.Icosahedron.clone(), pointsMat);
scene.add(mesh, meshSolid, points);

meshSolid.visible = false;
points.visible = false;

// Postprocessing
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight));
bloomPass.threshold = 0.6;
bloomPass.strength = 0.25;
bloomPass.radius = 0.25;

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// GUI
const params = {
	red: 1.0,
	green: 1.0,
	blue: 1.0,
	threshold: bloomPass.threshold,
	strength: bloomPass.strength,
	radius: bloomPass.radius,
	wireframe: true,
	geometry: 'Icosahedron',
	colorTheme: 'White',
	displayMode: 'Wireframe',
	bloom: true,
	pointSize: 5.0,
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

gui.add(params, 'geometry', Object.keys(geometries)).onChange(name => {
	const geo = geometries[name].clone();
	mesh.geometry.dispose();
	mesh.geometry = geo.clone();
	meshSolid.geometry.dispose();
	meshSolid.geometry = geo.clone();
	points.geometry.dispose();
	points.geometry = geo.clone();
});

gui.add(params, 'colorTheme', Object.keys(colorPresets)).onChange(name => {
	const c = colorPresets[name];
	uniforms.u_red.value = c.r;
	uniforms.u_green.value = c.g;
	uniforms.u_blue.value = c.b;
	params.red = c.r;
	params.green = c.g;
	params.blue = c.b;
	colorsFolder.updateDisplay();
});

gui.add(params, 'bloom').onChange(v => bloomPass.enabled = v);

gui.add(params, 'displayMode', ['Wireframe', 'Solid', 'Particle Cloud']).onChange(mode => {
	mesh.visible = mode === 'Wireframe';
	meshSolid.visible = mode === 'Solid';
	points.visible = mode === 'Particle Cloud';
});

gui.add(params, 'pointSize', 1, 20).onChange(v => uniforms.u_pointSize.value = v);

// Mouse movement
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
