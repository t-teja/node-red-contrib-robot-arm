'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalize, convertUnit, DEFAULT_JOINT_NAMES } = require('../lib/normalize');

describe('normalize', () => {
  it('handles ROS JointState-like payloads', () => {
    const out = normalize({
      name: ['shoulder_pan_joint', 'elbow_joint'],
      position: [0.1, 1.2]
    }, { source: 'ros' });
    assert.equal(out.joints.shoulder_pan_joint, 0.1);
    assert.equal(out.joints.elbow_joint, 1.2);
    assert.equal(out.source, 'ros');
    assert.equal(out.unit, 'rad');
  });

  it('handles flat joint objects', () => {
    const out = normalize({ shoulder_pan_joint: 0.5, wrist_3_joint: -1 }, { robot: 'arm1' });
    assert.equal(out.robot, 'arm1');
    assert.equal(out.joints.shoulder_pan_joint, 0.5);
    assert.equal(out.joints.wrist_3_joint, -1);
  });

  it('handles positional arrays with jointNames', () => {
    const out = normalize([0, -1.57, 1.57], {
      jointNames: DEFAULT_JOINT_NAMES
    });
    assert.equal(out.joints.shoulder_pan_joint, 0);
    assert.equal(out.joints.shoulder_lift_joint, -1.57);
    assert.equal(out.joints.elbow_joint, 1.57);
  });

  it('passes through canonical joints', () => {
    const out = normalize({
      joints: { a: 1 },
      unit: 'deg',
      source: 'pendant',
      robot: 'r'
    });
    assert.deepEqual(out.joints, { a: 1 });
    assert.equal(out.unit, 'deg');
    assert.equal(out.source, 'pendant');
  });

  it('returns empty joints for null', () => {
    const out = normalize(null);
    assert.deepEqual(out.joints, {});
  });
});

describe('convertUnit', () => {
  it('rad to deg', () => {
    const out = convertUnit({ j: Math.PI }, 'rad', 'deg');
    assert.ok(Math.abs(out.j - 180) < 1e-9);
  });

  it('deg to rad', () => {
    const out = convertUnit({ j: 180 }, 'deg', 'rad');
    assert.ok(Math.abs(out.j - Math.PI) < 1e-9);
  });

  it('same unit is identity copy', () => {
    const out = convertUnit({ j: 1 }, 'rad', 'rad');
    assert.deepEqual(out, { j: 1 });
  });
});
