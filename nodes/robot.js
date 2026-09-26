'use strict';

const path = require('path');
const fs = require('fs');
const { normalize, convertUnit, DEFAULT_JOINT_NAMES } = require('../lib/normalize');
const { RosbridgeClient } = require('../lib/rosbridge');

const PKG_ROOT = path.join(__dirname, '..');
const MODEL_PRESETS = {
  'ur5e-gripper': {
    dir: path.join(PKG_ROOT, 'models', 'ur5e-gripper'),
    urdf: 'ur5e_gripper.urdf',
    jointsMeta: 'joints.json'
  }
};

/** @type {Map<string, object>} */
const instances = new Map();

module.exports = function (RED) {
  let httpMounted = false;

  function ensureHttpRoutes() {
    if (httpMounted) return;
    httpMounted = true;

    const express = RED.httpNode;
    const resourcesDir = path.join(PKG_ROOT, 'resources');
    const modelsDir = path.join(PKG_ROOT, 'models');

    express.get('/robot-arm/static/:file', function (req, res) {
      const file = path.basename(req.params.file);
      const full = path.join(resourcesDir, file);
      if (!full.startsWith(resourcesDir) || !fs.existsSync(full)) {
        res.status(404).send('Not found');
        return;
      }
      res.sendFile(full);
    });

    express.get('/robot-arm/models/:preset/:file', function (req, res) {
      const preset = path.basename(req.params.preset);
      const file = path.basename(req.params.file);
      const full = path.join(modelsDir, preset, file);
      const base = path.join(modelsDir, preset);
      if (!full.startsWith(base) || !fs.existsSync(full)) {
        res.status(404).send('Not found');
        return;
      }
      res.type(file.endsWith('.urdf') || file.endsWith('.xml') ? 'application/xml' : 'application/json');
      res.sendFile(full);
    });

    express.get('/robot-arm/view/:id', function (req, res) {
      const id = req.params.id;
      const inst = instances.get(id);
      if (!inst) {
        res.status(404).send('Unknown robot node id. Deploy the flow first.');
        return;
      }
      const htmlPath = path.join(resourcesDir, 'viewer.html');
      let html = fs.readFileSync(htmlPath, 'utf8');
      html = html
        .replace(/__NODE_ID__/g, id)
        .replace(/__PRESET__/g, inst.modelPreset || 'ur5e-gripper')
        .replace(/__UNIT__/g, inst.unit || 'rad');
      res.type('html').send(html);
    });

    express.get('/robot-arm/api/:id/state', function (req, res) {
      const id = req.params.id;
      const inst = instances.get(id);
      if (!inst) {
        res.status(404).json({ error: 'unknown' });
        return;
      }
      const wantStream = req.query.stream === '1' || (req.headers.accept || '').includes('text/event-stream');
      if (wantStream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders && res.flushHeaders();
        const send = () => {
          res.write(`data: ${JSON.stringify(inst.getPublicState())}\n\n`);
        };
        send();
        const onUpdate = () => send();
        inst.clients.add(onUpdate);
        req.on('close', () => {
          inst.clients.delete(onUpdate);
        });
        return;
      }
      res.json(inst.getPublicState());
    });

    function readJson(req, cb) {
      if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        cb(null, req.body);
        return;
      }
      let raw = '';
      req.setEncoding('utf8');
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        if (!raw) return cb(null, {});
        try { cb(null, JSON.parse(raw)); }
        catch (e) { cb(e); }
      });
    }

    express.post('/robot-arm/api/:id/joints', function (req, res) {
      const id = req.params.id;
      const inst = instances.get(id);
      if (!inst) {
        res.status(404).json({ error: 'unknown' });
        return;
      }
      readJson(req, (err, body) => {
        if (err || !body || typeof body !== 'object') {
          res.status(400).json({ error: 'body required' });
          return;
        }
        inst.applyCommand(body, body.source || 'http');
        res.json({ ok: true });
      });
    });
  }

  function RobotNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    ensureHttpRoutes();

    node.name = config.name || '';
    node.modelPreset = config.modelPreset || 'ur5e-gripper';
    node.urdfPath = (config.urdfPath || '').trim();
    node.unit = config.unit === 'deg' ? 'deg' : 'rad';
    node.rosbridgeEnable = !!config.rosbridgeEnable;
    node.rosbridgeUrl = (config.rosbridgeUrl || 'ws://localhost:9090').trim();
    node.jointStatesTopic = (config.jointStatesTopic || '/joint_states').trim();
    node.publishTopic = (config.publishTopic || '').trim();
    node.robotTag = (config.robotTag || config.name || 'robot').trim() || 'robot';

    const preset = MODEL_PRESETS[node.modelPreset] || MODEL_PRESETS['ur5e-gripper'];
    let jointsMeta = { joints: DEFAULT_JOINT_NAMES.map((n) => ({ name: n })) };
    try {
      const metaPath = path.join(preset.dir, preset.jointsMeta);
      if (fs.existsSync(metaPath)) {
        jointsMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      }
    } catch (err) {
      node.warn('Could not load joints meta: ' + err.message);
    }

    const jointNames = (jointsMeta.joints || []).map((j) => j.name);

    const state = {
      joints: {},
      unit: node.unit,
      source: 'init',
      ts: Date.now(),
      rosbridge: 'disabled',
      viewUrl: `/robot-arm/view/${node.id}`
    };

    for (const j of jointsMeta.joints || []) {
      state.joints[j.name] = typeof j.home === 'number' ? j.home : 0;
    }

    const clients = new Set();
    let ros = null;
    let manualArmed = false;
    let lastPendantTs = 0;

    function getPublicState() {
      return {
        id: node.id,
        name: node.name,
        robot: node.robotTag,
        modelPreset: node.modelPreset,
        joints: { ...state.joints },
        unit: state.unit,
        source: state.source,
        ts: state.ts,
        rosbridge: state.rosbridge,
        viewUrl: state.viewUrl,
        jointNames,
        jointsMeta: jointsMeta.joints || []
      };
    }

    function broadcast() {
      for (const cb of clients) {
        try { cb(); } catch (_) { /* ignore */ }
      }
    }

    function setStatus() {
      const rb = node.rosbridgeEnable ? ` | ros:${state.rosbridge}` : '';
      node.status({
        fill: state.rosbridge === 'connected' ? 'green' : (node.rosbridgeEnable ? 'yellow' : 'blue'),
        shape: 'dot',
        text: `view ${state.viewUrl}${rb}`
      });
    }

    function applyCommand(payload, defaultSource) {
      const src = (payload && payload.source) || defaultSource || 'input';
      if (src === 'rosbridge' && manualArmed && Date.now() - lastPendantTs < 2000) {
        return false;
      }
      if (src === 'pendant' || src === 'controller') {
        lastPendantTs = Date.now();
        if (payload && payload.manualArmed != null) {
          manualArmed = !!payload.manualArmed;
        } else {
          manualArmed = true;
        }
      }
      if (payload && payload.freeze === true) {
        node.send({
          payload: getPublicState(),
          topic: 'status',
          frozen: true
        });
        return false;
      }

      const norm = normalize(payload, {
        robot: node.robotTag,
        unit: node.unit,
        source: src,
        jointNames
      });

      let joints = norm.joints;
      if (norm.unit !== node.unit && Object.keys(joints).length) {
        joints = convertUnit(joints, norm.unit, node.unit);
      }

      Object.assign(state.joints, joints);
      state.unit = node.unit;
      state.source = norm.source;
      state.ts = norm.ts;

      if (state.joints.finger_joint != null && state.joints.finger_joint_right == null) {
        state.joints.finger_joint_right = state.joints.finger_joint;
      }

      broadcast();

      const out = {
        robot: node.robotTag,
        joints: { ...state.joints },
        unit: state.unit,
        source: state.source,
        ts: state.ts
      };
      node.send({ payload: out, topic: 'joints' });

      if (ros && node.publishTopic && state.rosbridge === 'connected') {
        const names = Object.keys(state.joints);
        const positions = names.map((n) => {
          let v = state.joints[n];
          const meta = (jointsMeta.joints || []).find((j) => j.name === n);
          const isLinear = meta && meta.unit === 'm';
          if (!isLinear && node.unit === 'deg') {
            v = v * Math.PI / 180;
          }
          return v;
        });
        ros.publish(node.publishTopic, 'sensor_msgs/JointState', {
          name: names,
          position: positions,
          velocity: [],
          effort: []
        });
      }
      return true;
    }

    const inst = {
      id: node.id,
      modelPreset: node.modelPreset,
      unit: node.unit,
      clients,
      getPublicState,
      applyCommand
    };
    instances.set(node.id, inst);

    node.on('input', function (msg, send, done) {
      send = send || node.send.bind(node);
      try {
        const payload = msg.payload;
        if (msg.source && payload && typeof payload === 'object' && !Array.isArray(payload)) {
          payload.source = payload.source || msg.source;
        }
        applyCommand(payload, msg.source || 'input');
        if (done) done();
      } catch (err) {
        if (done) done(err);
        else node.error(err, msg);
      }
    });

    if (node.rosbridgeEnable) {
      ros = new RosbridgeClient({ url: node.rosbridgeUrl });
      ros.on('status', (s) => {
        state.rosbridge = s;
        setStatus();
      });
      ros.on('error', (err) => {
        node.warn('rosbridge: ' + (err && err.message ? err.message : String(err)));
      });
      ros.subscribe(node.jointStatesTopic, 'sensor_msgs/JointState', (rosMsg) => {
        applyCommand({
          name: rosMsg.name,
          position: rosMsg.position,
          source: 'rosbridge',
          unit: 'rad'
        }, 'rosbridge');
      });
      ros.connect();
      state.rosbridge = 'connecting';
    } else {
      state.rosbridge = 'disabled';
    }

    setStatus();

    node.on('close', function (removed, done) {
      instances.delete(node.id);
      if (ros) {
        ros.close();
        ros = null;
      }
      clients.clear();
      if (done) done();
    });
  }

  RED.nodes.registerType('robot', RobotNode);
};
