'use strict';

const { normalize, convertUnit } = require('./normalize');

/**
 * Pure-ish runtime for one robot instance: joint state, priority policy,
 * optional rosbridge publish callback. Used by the Node-RED `robot` node
 * and by automated tests (no RED dependency).
 */
class RobotRuntime {
  /**
   * @param {object} opts
   * @param {string} [opts.robotTag]
   * @param {string} [opts.unit] - 'rad' | 'deg'
   * @param {Array<{name:string, home?:number, unit?:string}>} opts.jointsMeta
   * @param {function} [opts.onPublish] - (topic, type, msg) => void
   * @param {string} [opts.publishTopic]
   * @param {function} [opts.getRosbridgeStatus] - () => string
   */
  constructor(opts = {}) {
    this.robotTag = (opts.robotTag || 'robot').trim() || 'robot';
    this.unit = opts.unit === 'deg' ? 'deg' : 'rad';
    this.jointsMeta = Array.isArray(opts.jointsMeta) ? opts.jointsMeta : [];
    this.jointNames = this.jointsMeta.map((j) => j.name);
    this.onPublish = typeof opts.onPublish === 'function' ? opts.onPublish : null;
    this.publishTopic = (opts.publishTopic || '').trim();
    this.getRosbridgeStatus = typeof opts.getRosbridgeStatus === 'function'
      ? opts.getRosbridgeStatus
      : () => 'disabled';

    this.joints = {};
    for (const j of this.jointsMeta) {
      this.joints[j.name] = typeof j.home === 'number' ? j.home : 0;
    }
    this.source = 'init';
    this.ts = Date.now();
    this.manualArmed = false;
    this.lastPendantTs = 0;
    this.clients = new Set();
  }

  getPublicState(extra = {}) {
    return {
      robot: this.robotTag,
      joints: { ...this.joints },
      unit: this.unit,
      source: this.source,
      ts: this.ts,
      rosbridge: this.getRosbridgeStatus(),
      jointNames: this.jointNames.slice(),
      jointsMeta: this.jointsMeta.slice(),
      ...extra
    };
  }

  broadcast() {
    for (const cb of this.clients) {
      try { cb(); } catch (_) { /* ignore */ }
    }
  }

  /**
   * @param {*} payload
   * @param {string} [defaultSource]
   * @returns {{ applied: boolean, out?: object, frozen?: boolean }}
   */
  applyCommand(payload, defaultSource) {
    const src = (payload && payload.source) || defaultSource || 'input';
    if (src === 'rosbridge' && this.manualArmed && Date.now() - this.lastPendantTs < 2000) {
      return { applied: false };
    }
    if (src === 'pendant' || src === 'controller') {
      this.lastPendantTs = Date.now();
      if (payload && payload.manualArmed != null) {
        this.manualArmed = !!payload.manualArmed;
      } else {
        this.manualArmed = true;
      }
    }
    if (payload && payload.freeze === true) {
      return { applied: false, frozen: true, out: this.getPublicState() };
    }

    const norm = normalize(payload, {
      robot: this.robotTag,
      unit: this.unit,
      source: src,
      jointNames: this.jointNames
    });

    let joints = norm.joints;
    if (norm.unit !== this.unit && Object.keys(joints).length) {
      const angular = {};
      const linear = {};
      for (const [k, v] of Object.entries(joints)) {
        const meta = this.jointsMeta.find((j) => j.name === k);
        if (meta && meta.unit === 'm') linear[k] = v;
        else angular[k] = v;
      }
      joints = { ...convertUnit(angular, norm.unit, this.unit), ...linear };
    }

    Object.assign(this.joints, joints);
    this.source = norm.source;
    this.ts = norm.ts;

    if (this.joints.finger_joint != null && this.joints.finger_joint_right == null) {
      this.joints.finger_joint_right = this.joints.finger_joint;
    }

    this.broadcast();

    const out = {
      robot: this.robotTag,
      joints: { ...this.joints },
      unit: this.unit,
      source: this.source,
      ts: this.ts
    };

    if (this.onPublish && this.publishTopic && this.getRosbridgeStatus() === 'connected') {
      const names = Object.keys(this.joints);
      const positions = names.map((n) => {
        let v = this.joints[n];
        const meta = this.jointsMeta.find((j) => j.name === n);
        const isLinear = meta && meta.unit === 'm';
        if (!isLinear && this.unit === 'deg') {
          v = v * Math.PI / 180;
        }
        return v;
      });
      this.onPublish(this.publishTopic, 'sensor_msgs/JointState', {
        name: names,
        position: positions,
        velocity: [],
        effort: []
      });
    }

    return { applied: true, out };
  }
}

module.exports = { RobotRuntime };
