import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import URDFLoader from 'urdf-loader';

const cfg = window.__ROBOT_ARM__ || {};
const nodeId = cfg.nodeId;
const preset = cfg.preset || 'ur5e';
const urdfFile = cfg.urdf || (preset === 'ur5e-gripper' ? 'ur5e_gripper.urdf' : 'ur5e.urdf');
const errEl = document.getElementById('err');
const srcEl = document.getElementById('src');
const rbEl = document.getElementById('rb');

function showErr(msg) {
  errEl.style.display = 'block';
  errEl.textContent = msg;
}

const wrap = document.getElementById('canvas-wrap');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1419);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
const viewDir = new THREE.Vector3(0.9, 0.55, 0.9);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
wrap.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.target.set(0, 0, 0);
controls.update();

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const dir = new THREE.DirectionalLight(0xffffff, 0.85);
dir.position.set(2, 3, 1);
scene.add(dir);
const grid = new THREE.GridHelper(2, 20, 0x334466, 0x1e2a3a);
scene.add(grid);

let robot = null;
let poseFramed = false;

// Keep the base (robot origin) at the center of the panel and pull the
// camera back until the whole arm fits the current width and height.
function frameBase(keepAngle) {
  if (!robot) return;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (w < 2 || h < 2) return;
  camera.aspect = w / h;
  renderer.setSize(w, h, false);
  robot.updateMatrixWorld(true);
  const origin = new THREE.Vector3();
  robot.getWorldPosition(origin);
  const box = new THREE.Box3().setFromObject(robot);
  if (box.isEmpty()) return;
  const corner = new THREE.Vector3();
  let radius = 0.25;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        corner.set(x, y, z);
        radius = Math.max(radius, corner.distanceTo(origin));
      }
    }
  }
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const distance = Math.max(radius / Math.tan(vFov / 2), radius / Math.tan(hFov / 2)) * 1.35;
  if (keepAngle) {
    viewDir.copy(camera.position).sub(controls.target);
    if (viewDir.lengthSq() < 1e-8) viewDir.set(0.9, 0.55, 0.9);
  } else {
    viewDir.set(0.9, 0.55, 0.9);
  }
  viewDir.normalize();
  controls.target.copy(origin);
  camera.position.copy(origin).addScaledVector(viewDir, distance);
  camera.near = Math.max(distance / 200, 0.001);
  camera.far = Math.max(distance * 20, 10);
  camera.updateProjectionMatrix();
  const floor = Math.max(radius * 2.4, 0.6);
  grid.scale.set(floor / 2, 1, floor / 2);
  controls.update();
}

function resize() {
  frameBase(true);
}
window.addEventListener('resize', resize);
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => frameBase(true)).observe(wrap);
}
resize();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

function applyJoints(joints) {
  if (!robot || !joints) return;
  for (const [name, value] of Object.entries(joints)) {
    const j = robot.joints && robot.joints[name];
    if (j) {
      try {
        j.setJointValue(value);
      } catch (_) {
        if (typeof j.setJointValue === 'function') j.setJointValue(value);
      }
    }
  }
  if (joints.finger_joint != null && robot.joints && robot.joints.finger_joint_right) {
    try {
      robot.joints.finger_joint_right.setJointValue(joints.finger_joint);
    } catch (_) { /* ignore */ }
  }
  if (!poseFramed) {
    poseFramed = true;
    frameBase(false);
  }
}

async function loadUrdf() {
  const base = `/robot-arm/models/${encodeURIComponent(preset)}/`;
  const url = `${base}${encodeURIComponent(urdfFile)}`;
  const loader = new URDFLoader();
  // Relative mesh paths in URDF are "meshes/foo.stl" → resolve under the preset dir.
  loader.workingPath = base;
  loader.packages = {
    '': base,
    ur5e: base,
    'ur5e-gripper': base
  };
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (result) => resolve(result),
      undefined,
      (e) => reject(e)
    );
  });
}

try {
  robot = await loadUrdf();
  // URDF Z-up → Three.js Y-up
  robot.rotation.x = -Math.PI / 2;
  robot.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      mat.side = THREE.DoubleSide;
      if ('metalness' in mat) {
        mat.metalness = 0.35;
        mat.roughness = 0.45;
      }
      mat.needsUpdate = true;
    }
  });
  scene.add(robot);
  frameBase(false);
} catch (e) {
  showErr('URDF load failed: ' + (e && e.message ? e.message : String(e)));
}

function onState(data) {
  if (!data) return;
  srcEl.textContent = 'source: ' + (data.source || '—');
  srcEl.classList.toggle('ok', !!data.source);
  rbEl.textContent = 'ros: ' + (data.rosbridge || '—');
  rbEl.classList.toggle('ok', data.rosbridge === 'connected');
  applyJoints(data.joints);
}

const es = new EventSource(`/robot-arm/api/${encodeURIComponent(nodeId)}/state?stream=1`);
es.onmessage = (ev) => {
  try {
    onState(JSON.parse(ev.data));
  } catch (_) { /* ignore */ }
};
es.onerror = () => {
  es.close();
  setInterval(async () => {
    try {
      const r = await fetch(`/robot-arm/api/${encodeURIComponent(nodeId)}/state`);
      onState(await r.json());
    } catch (_) { /* ignore */ }
  }, 200);
};
