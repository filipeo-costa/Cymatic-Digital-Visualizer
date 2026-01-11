// ==========================
// GEOMETRY MENU UI
// ==========================
const geometryIcons = {
  Icosahedron: '⬡',
  Sphere: '◯',
  Torus: '⬭',
  Cube: '⬢',
  Octahedron: '◇',
  Dodecahedron: '⬣',
  Cone: '▲'
};

const geoMenu = document.createElement('div');
geoMenu.id = 'geometry-menu';
document.body.appendChild(geoMenu);

const geoButtons = {};
const params = { geometry: 'Icosahedron' };

function selectGeometry(name) {
  params.geometry = name;
  const newGeo = geometries[name].clone();

  meshWireframe.geometry.dispose();
  meshSolid.geometry.dispose();
  points.geometry.dispose();

  meshWireframe.geometry = newGeo.clone();
  meshSolid.geometry = newGeo.clone();
  points.geometry = newGeo.clone();

  Object.values(geoButtons).forEach(b => b.classList.remove('active'));
  geoButtons[name].classList.add('active');
}

Object.keys(geometries).forEach(name => {
  const btn = document.createElement('div');
  btn.className = 'geo-btn';

  const icon = document.createElement('div');
  icon.className = 'geo-icon';
  icon.textContent = geometryIcons[name] || '◯';

  const label = document.createElement('div');
  label.textContent = name;

  btn.append(icon, label);
  geoMenu.appendChild(btn);

  btn.addEventListener('click', () => selectGeometry(name));
  geoButtons[name] = btn;
});

selectGeometry(params.geometry);
