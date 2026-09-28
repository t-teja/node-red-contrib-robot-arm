'use strict';

const path = require('path');
const fs = require('fs');
const { DEFAULT_JOINT_NAMES } = require('../lib/normalize');
const { RosbridgeClient } = require('../lib/rosbridge');
const { RobotRuntime } = require('../lib/robot-runtime');

const PKG_ROOT = path.join(__dirname, '..');
const MODEL_PRESETS = {
  ur5e: {
    dir: path.join(PKG_ROOT, 'models', 'ur5e'),
    urdf: 'ur5e.urdf',
    jointsMeta: 'joints.json'
  },
  'ur5e-gripper': {
    dir: path.join(PKG_ROOT, 'models', 'ur5e-gripper'),
    urdf: 'ur5e_gripper.urdf',
    jointsMeta: 'joints.json'
  }
};

/** @type {Map<string, object>} */
const instances = new Map();

function listRobotInstances() {
  const out = [];
  for (const [id, inst] of instances.entries()) {
    out.push({
      id,
      name: inst.name || '',
      robotTag: inst.robotTag || 'robot',
      modelPreset: inst.modelPreset,
      viewUrl: `/robot-arm/view/${id}`,
      pendantUrl: `/robot-arm/pendant/${id}`
    });
  }
  return out;
}

function getInstance(id) {
  return instances.get(id) || null;
}

module.exports = function (RED) {
  let httpMounted = false;

  function ensureHttpRoutes() {
    if (httpMounted) return;
    httpMounted = true;

    const express = RED.httpNode;
    const resourcesDir = path.join(PKG_ROOT, 'resources');
    const modelsDir = path.join(PKG_ROOT, 'models');

    function allowEmbed(res) {
      // Permit same-origin Dashboard 2 iframes; do not set X-Frame-Options: DENY.
      res.removeHeader('X-Frame-Options');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    }

    express.get('/robot-arm/static/:file', function (req, res) {
      const file = path.basename(req.params.file);
      const full = path.join(resourcesDir, file);
      if (!full.startsWith(resourcesDir) || !fs.existsSync(full)) {
        res.status(404).send('Not found');
        return;
      }
      res.sendFile(full);
    });

    // Nested model assets: /robot-arm/models/ur5e/ur5e.urdf and .../meshes/base.stl
    express.get(/^\/robot-arm\/models\/([^/]+)\/(.+)$/, function (req, res) {
      const preset = path.basename(req.params[0]);
      const rel = String(req.params[1] || '').replace(/^\/+/, '');
      if (!rel || rel.split('/').some((p) => p === '..')) {
        res.status(400).send('Bad path');
        return;
      }
      const base = path.join(modelsDir, preset);
      const full = path.normalize(path.join(base, rel));
      if (!full.startsWith(base) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
        res.status(404).send('Not found');
        return;
      }
      if (/\.urdf$/i.test(rel) || /\.xml$/i.test(rel)) {
        res.type('application/xml');
      } else if (/\.json$/i.test(rel)) {
        res.type('application/json');
      } else if (/\.stl$/i.test(rel)) {
        res.type('model/stl');
      }
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
      const preset = MODEL_PRESETS[inst.modelPreset] || MODEL_PRESETS.ur5e;
      html = html
        .replace(/__NODE_ID__/g, id)
        .replace(/__PRESET__/g, inst.modelPreset || 'ur5e')
        .replace(/__URDF__/g, preset.urdf)
        .replace(/__UNIT__/g, inst.unit || 'rad');
      allowEmbed(res);
      res.type('html').send(html);
    });

    // Robot-bound teach pendant (used by Dashboard 2 ui-robot-controller iframe)
    express.get('/robot-arm/pendant/:id', function (req, res) {
      const id = req.params.id;
      const inst = instances.get(id);
      if (!inst) {
        res.status(404).send('Unknown robot node id. Deploy the flow first.');
        return;
      }
      const htmlPath = path.join(resourcesDir, 'pendant.html');
      let html = fs.readFileSync(htmlPath, 'utf8');
      html = html
        .replace(/__NODE_ID__/g, id)
        .replace(/__UNIT__/g, inst.unit || 'rad')
        .replace(/__ROBOT__/g, inst.robotTag || 'robot');
      allowEmbed(res);
      res.type('html').send(html);
    });

    express.get('/robot-arm/api/robots', function (req, res) {
      res.json({ robots: listRobotInstances() });
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
    node.modelPreset = config.modelPreset || 'ur5e';
    if (!MODEL_PRESETS[node.modelPreset]) node.modelPreset = 'ur5e';
    node.urdfPath = (config.urdfPath || '').trim();
    node.unit = config.unit === 'deg' ? 'deg' : 'rad';
    node.rosbridgeEnable = !!config.rosbridgeEnable;
    node.rosbridgeUrl = (config.rosbridgeUrl || 'ws://localhost:9090').trim();
    node.jointStatesTopic = (config.jointStatesTopic || '/joint_states').trim();
    node.publishTopic = (config.publishTopic || '').trim();
    node.robotTag = (config.robotTag || config.name || 'robot').trim() || 'robot';

    const preset = MODEL_PRESETS[node.modelPreset] || MODEL_PRESETS.ur5e;
    let jointsMeta = { joints: DEFAULT_JOINT_NAMES.map((n) => ({ name: n })) };
    try {
      const metaPath = path.join(preset.dir, preset.jointsMeta);
      if (fs.existsSync(metaPath)) {
        jointsMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      }
    } catch (err) {
      node.warn('Could not load joints meta: ' + err.message);
    }

    let ros = null;
    let rosStatus = node.rosbridgeEnable ? 'connecting' : 'disabled';

    const runtime = new RobotRuntime({
      robotTag: node.robotTag,
      unit: node.unit,
      jointsMeta: jointsMeta.joints || [],
      publishTopic: node.publishTopic,
      getRosbridgeStatus: () => rosStatus,
      onPublish: (topic, type, msg) => {
        if (ros) ros.publish(topic, type, msg);
      }
    });

    function getPublicState() {
      return runtime.getPublicState({
        id: node.id,
        name: node.name,
        modelPreset: node.modelPreset,
        viewUrl: `/robot-arm/view/${node.id}`,
        pendantUrl: `/robot-arm/pendant/${node.id}`,
        urdf: preset.urdf
      });
    }

    function setStatus() {
      const rb = node.rosbridgeEnable ? ` | ros:${rosStatus}` : '';
      node.status({
        fill: rosStatus === 'connected' ? 'green' : (node.rosbridgeEnable ? 'yellow' : 'blue'),
        shape: 'dot',
        text: `view /robot-arm/view/${node.id}${rb}`
      });
    }

    function applyCommand(payload, defaultSource) {
      const result = runtime.applyCommand(payload, defaultSource);
      if (result.frozen) {
        node.send({
          payload: getPublicState(),
          topic: 'status',
          frozen: true
        });
        return false;
      }
      if (!result.applied) return false;
      node.send({ payload: result.out, topic: 'joints' });
      return true;
    }

    const inst = {
      id: node.id,
      name: node.name,
      robotTag: node.robotTag,
      modelPreset: node.modelPreset,
      unit: node.unit,
      urdf: preset.urdf,
      clients: runtime.clients,
      runtime,
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
        rosStatus = s;
        setStatus();
      });
      ros.on('error', (err) => {
        node.warn('rosbridge: ' + (err && err.message ? err.message : String(err)));
      });
      if (node.publishTopic) {
        ros.advertise(node.publishTopic, 'sensor_msgs/JointState');
      }
      ros.subscribe(node.jointStatesTopic, 'sensor_msgs/JointState', (rosMsg) => {
        applyCommand({
          name: rosMsg.name,
          position: rosMsg.position,
          source: 'rosbridge',
          unit: 'rad'
        }, 'rosbridge');
      });
      ros.connect();
      rosStatus = 'connecting';
    } else {
      rosStatus = 'disabled';
    }

    setStatus();

    node.on('close', function (removed, done) {
      instances.delete(node.id);
      if (ros) {
        ros.close();
        ros = null;
      }
      runtime.clients.clear();
      if (done) done();
    });
  }

  RED.nodes.registerType('robot', RobotNode);
};

module.exports.MODEL_PRESETS = MODEL_PRESETS;
module.exports.listRobotInstances = listRobotInstances;
module.exports.getInstance = getInstance;
