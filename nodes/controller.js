'use strict';

const path = require('path');
const fs = require('fs');
const { DEFAULT_JOINT_NAMES } = require('../lib/normalize');

const PKG_ROOT = path.join(__dirname, '..');

/** @type {Map<string, object>} */
const controllers = new Map();

module.exports = function (RED) {
  let httpMounted = false;

  function ensureHttpRoutes() {
    if (httpMounted) return;
    httpMounted = true;
    const express = RED.httpNode;
    const resourcesDir = path.join(PKG_ROOT, 'resources');

    express.get('/robot-arm/controller/:id', function (req, res) {
      const id = req.params.id;
      const inst = controllers.get(id);
      if (!inst) {
        res.status(404).send('Unknown controller node id. Deploy the flow first.');
        return;
      }
      const htmlPath = path.join(resourcesDir, 'controller.html');
      let html = fs.readFileSync(htmlPath, 'utf8');
      html = html
        .replace(/__NODE_ID__/g, id)
        .replace(/__UNIT__/g, inst.unit || 'rad')
        .replace(/__ROBOT__/g, inst.robotTag || 'robot');
      res.type('html').send(html);
    });

    express.get('/robot-arm/api/controller/:id/meta', function (req, res) {
      const id = req.params.id;
      const inst = controllers.get(id);
      if (!inst) {
        res.status(404).json({ error: 'unknown' });
        return;
      }
      res.json(inst.getMeta());
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

    express.post('/robot-arm/api/controller/:id/command', function (req, res) {
      const id = req.params.id;
      const inst = controllers.get(id);
      if (!inst) {
        res.status(404).json({ error: 'unknown' });
        return;
      }
      readJson(req, (err, body) => {
        if (err) {
          res.status(400).json({ error: 'invalid json' });
          return;
        }
        inst.emitCommand(body || {});
        res.json({ ok: true });
      });
    });
  }

  function loadPresetJoints(preset) {
    const metaPath = path.join(PKG_ROOT, 'models', preset || 'ur5e', 'joints.json');
    try {
      if (fs.existsSync(metaPath)) {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      }
    } catch (_) { /* ignore */ }
    return {
      joints: DEFAULT_JOINT_NAMES.map((n) => ({
        name: n,
        label: n,
        min: -3.14,
        max: 3.14,
        home: 0
      }))
    };
  }

  function ControllerNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    ensureHttpRoutes();

    node.name = config.name || '';
    node.robotTag = (config.robotTag || 'robot').trim() || 'robot';
    node.modelPreset = config.modelPreset || 'ur5e';
    node.unit = config.unit === 'deg' ? 'deg' : 'rad';
    node.stepSize = Number(config.stepSize) || 0.01;

    const meta = loadPresetJoints(node.modelPreset);
    let jointsDef = meta.joints || [];

    if (config.jointList && String(config.jointList).trim()) {
      const names = String(config.jointList).split(',').map((s) => s.trim()).filter(Boolean);
      jointsDef = names.map((n) => {
        const found = (meta.joints || []).find((j) => j.name === n);
        return found || { name: n, label: n, min: -3.14, max: 3.14, home: 0 };
      });
    }

    if (node.unit === 'deg') {
      jointsDef = jointsDef.map((j) => {
        if (j.unit === 'm') return { ...j };
        const f = 180 / Math.PI;
        return {
          ...j,
          min: j.min * f,
          max: j.max * f,
          home: (j.home || 0) * f
        };
      });
    }

    const current = {};
    for (const j of jointsDef) {
      current[j.name] = typeof j.home === 'number' ? j.home : 0;
    }

    let frozen = false;
    let manualArmed = true;
    let lastEmit = 0;
    const rateMs = 50;

    const viewUrl = `/robot-arm/controller/${node.id}`;

    function getMeta() {
      return {
        id: node.id,
        name: node.name,
        robot: node.robotTag,
        unit: node.unit,
        stepSize: node.stepSize,
        joints: jointsDef,
        current: { ...current },
        frozen,
        manualArmed,
        controllerUrl: viewUrl
      };
    }

    function emitCommand(body) {
      if (body.freeze != null) frozen = !!body.freeze;
      if (body.manualArmed != null) manualArmed = !!body.manualArmed;

      if (body.home) {
        for (const j of jointsDef) {
          current[j.name] = typeof j.home === 'number' ? j.home : 0;
        }
      }

      if (body.joints && typeof body.joints === 'object') {
        for (const [k, v] of Object.entries(body.joints)) {
          const n = Number(v);
          if (Number.isFinite(n)) current[k] = n;
        }
      }

      if (current.finger_joint != null) {
        current.finger_joint_right = current.finger_joint;
      }

      const now = Date.now();
      if (!body.force && now - lastEmit < rateMs) {
        node.status({ fill: 'blue', shape: 'ring', text: viewUrl });
        return;
      }
      lastEmit = now;

      const payload = {
        robot: node.robotTag,
        joints: { ...current },
        unit: node.unit,
        source: 'pendant',
        manualArmed,
        freeze: frozen,
        ts: now
      };

      node.send({ payload, topic: frozen ? 'freeze' : 'joints' });
      node.status({
        fill: frozen ? 'red' : (manualArmed ? 'green' : 'yellow'),
        shape: 'dot',
        text: frozen ? 'FREEZE ' + viewUrl : viewUrl
      });
    }

    controllers.set(node.id, {
      unit: node.unit,
      robotTag: node.robotTag,
      getMeta,
      emitCommand
    });

    node.status({ fill: 'blue', shape: 'dot', text: viewUrl });

    node.on('input', function (msg, send, done) {
      try {
        const p = msg.payload;
        if (p === 'home' || (p && p.home)) {
          emitCommand({ home: true, force: true });
        } else if (p && typeof p === 'object') {
          emitCommand(Object.assign({ force: true }, p));
        }
        if (done) done();
      } catch (err) {
        if (done) done(err);
        else node.error(err, msg);
      }
    });

    node.on('close', function (removed, done) {
      controllers.delete(node.id);
      if (done) done();
    });
  }

  RED.nodes.registerType('controller', ControllerNode);
};
