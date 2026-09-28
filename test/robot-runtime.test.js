'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { RobotRuntime } = require('../lib/robot-runtime');
const { normalize } = require('../lib/normalize');

const UR5E_JOINTS = [
  { name: 'shoulder_pan_joint', home: 0 },
  { name: 'shoulder_lift_joint', home: -1.57 },
  { name: 'elbow_joint', home: 1.57 },
  { name: 'wrist_1_joint', home: -1.57 },
  { name: 'wrist_2_joint', home: -1.57 },
  { name: 'wrist_3_joint', home: 0 }
];

describe('RobotRuntime.applyCommand', () => {
  it('applies README canonical inject payload', () => {
    const rt = new RobotRuntime({ jointsMeta: UR5E_JOINTS, unit: 'rad' });
    const payload = {
      robot: 'robot',
      joints: {
        shoulder_pan_joint: 0,
        shoulder_lift_joint: -1.57,
        elbow_joint: 1.57,
        wrist_1_joint: -1.57,
        wrist_2_joint: -1.57,
        wrist_3_joint: 0
      },
      unit: 'rad',
      source: 'inject'
    };
    const result = rt.applyCommand(payload, 'input');
    assert.equal(result.applied, true);
    assert.equal(result.out.joints.elbow_joint, 1.57);
    assert.equal(result.out.source, 'inject');
    assert.equal(rt.joints.shoulder_lift_joint, -1.57);
  });

  it('applies ROS JointState-like and flat maps end-to-end via normalize', () => {
    const rt = new RobotRuntime({ jointsMeta: UR5E_JOINTS });
    const rosLike = normalize({
      name: ['shoulder_pan_joint', 'elbow_joint'],
      position: [0.25, -0.5]
    }, { source: 'function' });
    const r1 = rt.applyCommand(rosLike, 'function');
    assert.equal(r1.applied, true);
    assert.equal(rt.joints.shoulder_pan_joint, 0.25);
    assert.equal(rt.joints.elbow_joint, -0.5);

    const r2 = rt.applyCommand({ wrist_3_joint: 1.1, source: 'inject' });
    assert.equal(rt.joints.wrist_3_joint, 1.1);
    assert.equal(rt.joints.elbow_joint, -0.5); // preserved
  });

  it('applies positional array using jointNames', () => {
    const rt = new RobotRuntime({ jointsMeta: UR5E_JOINTS });
    const r = rt.applyCommand([0.1, -1.0, 1.2], 'inject');
    assert.equal(r.applied, true);
    assert.equal(rt.joints.shoulder_pan_joint, 0.1);
    assert.equal(rt.joints.shoulder_lift_joint, -1.0);
    assert.equal(rt.joints.elbow_joint, 1.2);
  });

  it('ignores rosbridge while pendant recently armed', () => {
    const rt = new RobotRuntime({ jointsMeta: UR5E_JOINTS });
    rt.applyCommand({
      joints: { elbow_joint: 0.5 },
      source: 'pendant',
      manualArmed: true
    });
    assert.equal(rt.joints.elbow_joint, 0.5);
    const blocked = rt.applyCommand({
      name: ['elbow_joint'],
      position: [9.9],
      source: 'rosbridge',
      unit: 'rad'
    }, 'rosbridge');
    assert.equal(blocked.applied, false);
    assert.equal(rt.joints.elbow_joint, 0.5);
  });

  it('publishes JointState when rosbridge connected and publishTopic set', () => {
    const published = [];
    const rt = new RobotRuntime({
      jointsMeta: UR5E_JOINTS,
      publishTopic: '/joint_command',
      getRosbridgeStatus: () => 'connected',
      onPublish: (topic, type, msg) => published.push({ topic, type, msg })
    });
    rt.applyCommand({ joints: { elbow_joint: 0.33 }, source: 'inject' });
    assert.equal(published.length, 1);
    assert.equal(published[0].topic, '/joint_command');
    assert.equal(published[0].type, 'sensor_msgs/JointState');
    assert.ok(published[0].msg.name.includes('elbow_joint'));
    const idx = published[0].msg.name.indexOf('elbow_joint');
    assert.equal(published[0].msg.position[idx], 0.33);
  });

  it('does not publish when rosbridge disabled', () => {
    const published = [];
    const rt = new RobotRuntime({
      jointsMeta: UR5E_JOINTS,
      publishTopic: '/joint_command',
      getRosbridgeStatus: () => 'disabled',
      onPublish: (topic, type, msg) => published.push(msg)
    });
    rt.applyCommand({ joints: { elbow_joint: 1 }, source: 'inject' });
    assert.equal(published.length, 0);
  });
});
