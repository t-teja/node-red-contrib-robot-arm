'use strict';

/**
 * Normalize joint / pose payloads into a canonical form:
 *   { robot, joints: { name: number }, unit: 'rad'|'deg', source, ts }
 *
 * Accepts:
 *  - ROS JointState-like: { name: string[], position: number[] }
 *  - flat object of joint name → value
 *  - msg.payload as array (positional; needs jointNames)
 *  - already-canonical { joints, unit, ... }
 */

const DEFAULT_JOINT_NAMES = [
  'shoulder_pan_joint',
  'shoulder_lift_joint',
  'elbow_joint',
  'wrist_1_joint',
  'wrist_2_joint',
  'wrist_3_joint',
  'finger_joint'
];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function toNumberMap(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/**
 * @param {*} payload - msg.payload or raw object
 * @param {object} [opts]
 * @param {string} [opts.robot]
 * @param {string} [opts.unit] - 'rad' | 'deg'
 * @param {string} [opts.source]
 * @param {string[]} [opts.jointNames] - used when payload is a bare array
 * @returns {{ robot: string, joints: Object.<string,number>, unit: string, source: string, ts: number }}
 */
function normalize(payload, opts = {}) {
  const unit = opts.unit === 'deg' ? 'deg' : 'rad';
  const robot = opts.robot || 'robot';
  const source = opts.source || 'unknown';
  const ts = Date.now();
  const jointNames = Array.isArray(opts.jointNames) && opts.jointNames.length
    ? opts.jointNames
    : DEFAULT_JOINT_NAMES;

  let joints = {};

  if (payload == null) {
    return { robot, joints: {}, unit, source, ts };
  }

  // Already canonical
  if (isPlainObject(payload) && isPlainObject(payload.joints)) {
    joints = toNumberMap(payload.joints);
    return {
      robot: payload.robot || robot,
      joints,
      unit: payload.unit === 'deg' || payload.unit === 'rad' ? payload.unit : unit,
      source: payload.source || source,
      ts: typeof payload.ts === 'number' ? payload.ts : ts
    };
  }

  // ROS JointState-like
  if (
    isPlainObject(payload) &&
    Array.isArray(payload.name) &&
    Array.isArray(payload.position)
  ) {
    const n = Math.min(payload.name.length, payload.position.length);
    for (let i = 0; i < n; i++) {
      const name = String(payload.name[i]);
      const val = Number(payload.position[i]);
      if (name && Number.isFinite(val)) joints[name] = val;
    }
    return {
      robot: payload.robot || robot,
      joints,
      unit: payload.unit === 'deg' || payload.unit === 'rad' ? payload.unit : unit,
      source: payload.source || source,
      ts
    };
  }

  // Bare array → positional joints
  if (Array.isArray(payload)) {
    const n = Math.min(payload.length, jointNames.length);
    for (let i = 0; i < n; i++) {
      const val = Number(payload[i]);
      if (Number.isFinite(val)) joints[jointNames[i]] = val;
    }
    return { robot, joints, unit, source, ts };
  }

  // Flat object of joint → value (ignore meta keys)
  if (isPlainObject(payload)) {
    const meta = new Set(['robot', 'unit', 'source', 'ts', 'name', 'position', 'velocity', 'effort', 'header']);
    const raw = {};
    for (const [k, v] of Object.entries(payload)) {
      if (meta.has(k)) continue;
      if (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)))) {
        raw[k] = v;
      }
    }
    joints = toNumberMap(raw);
    return {
      robot: payload.robot || robot,
      joints,
      unit: payload.unit === 'deg' || payload.unit === 'rad' ? payload.unit : unit,
      source: payload.source || source,
      ts
    };
  }

  return { robot, joints: {}, unit, source, ts };
}

/**
 * Convert joints between rad and deg (in place copy).
 */
function convertUnit(joints, fromUnit, toUnit) {
  if (fromUnit === toUnit) return { ...joints };
  const factor = fromUnit === 'deg' && toUnit === 'rad' ? Math.PI / 180
    : fromUnit === 'rad' && toUnit === 'deg' ? 180 / Math.PI
    : 1;
  const out = {};
  for (const [k, v] of Object.entries(joints)) {
    out[k] = v * factor;
  }
  return out;
}

module.exports = {
  normalize,
  convertUnit,
  DEFAULT_JOINT_NAMES
};
