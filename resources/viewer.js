import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import URDFLoader from 'urdf-loader';

const cfg = window.__ROBOT_ARM__ || {};
const nodeId = cfg.nodeId;
const preset = cfg.preset || 'ur5e-gripper';
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

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 50);
camera.position.set(1.2, 1.0, 1.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
wrap.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.4, 0);
controls.update();

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const dir = new THREE.DirectionalLight(0xffffff, 0.85);
dir.position.set(2, 3, 1);
scene.add(dir);
const grid = new THREE.GridHelper(2, 20, 0x334466, 0x1e2a3a);
scene.add(grid);

let robot = null;

function resize() {
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
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
  if (joints.finger_joint != null && robot.joints.finger_joint_right) {
    try {
      robot.joints.finger_joint_right.setJointValue(joints.finger_joint);
    } catch (_) { /* ignore */ }
  }
}

async function loadUrdf() {
  const url = `/robot-arm/models/${encodeURIComponent(preset)}/ur5e_gripper.urdf`;
  const loader = new URDFLoader();
  loader.packages = {};
  loader.workingPath = `/robot-arm/models/${encodeURIComponent(preset)}/`;
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
  robot.rotation.x = -Math.PI / 2;
  scene.add(robot);
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
