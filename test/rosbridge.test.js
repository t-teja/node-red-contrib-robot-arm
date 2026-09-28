'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { WebSocketServer } = require('ws');
const { RosbridgeClient } = require('../lib/rosbridge');
const { RobotRuntime } = require('../lib/robot-runtime');

const UR5E_JOINTS = [
  { name: 'shoulder_pan_joint', home: 0 },
  { name: 'shoulder_lift_joint', home: -1.57 },
  { name: 'elbow_joint', home: 1.57 },
  { name: 'wrist_1_joint', home: -1.57 },
  { name: 'wrist_2_joint', home: -1.57 },
  { name: 'wrist_3_joint', home: 0 }
];

describe('RosbridgeClient + mock server', () => {
  let server;
  let wss;
  let port;
  /** @type {import('ws').WebSocket[]} */
  let clients = [];

  before(async () => {
    server = http.createServer();
    wss = new WebSocketServer({ server });
    wss.on('connection', (ws) => {
      clients.push(ws);
      ws.on('close', () => {
        clients = clients.filter((c) => c !== ws);
      });
    });
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    port = server.address().port;
  });

  after(async () => {
    for (const c of clients) {
      try { c.close(); } catch (_) {}
    }
    await new Promise((resolve) => wss.close(() => server.close(resolve)));
  });

  it('subscribes and updates robot state from sensor_msgs/JointState', async () => {
    const url = `ws://127.0.0.1:${port}`;
    const rt = new RobotRuntime({ jointsMeta: UR5E_JOINTS });
    const ros = new RosbridgeClient({ url, reconnectMs: 0 });

    const subscribed = new Promise((resolve) => {
      const onConn = (ws) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.op === 'subscribe' && msg.topic === '/joint_states') {
            resolve({ ws, msg });
          }
        });
      };
      wss.on('connection', onConn);
      // already-connected clients
      for (const ws of clients) onConn(ws);
    });

    const statusConnected = new Promise((resolve) => {
      ros.on('status', (s) => { if (s === 'connected') resolve(); });
    });

    ros.subscribe('/joint_states', 'sensor_msgs/JointState', (rosMsg) => {
      rt.applyCommand({
        name: rosMsg.name,
        position: rosMsg.position,
        source: 'rosbridge',
        unit: 'rad'
      }, 'rosbridge');
    });
    ros.connect();

    await statusConnected;
    const { ws } = await subscribed;

    ws.send(JSON.stringify({
      op: 'publish',
      topic: '/joint_states',
      msg: {
        name: ['shoulder_pan_joint', 'elbow_joint', 'wrist_3_joint'],
        position: [0.42, -0.77, 1.05],
        velocity: [],
        effort: []
      }
    }));

    await new Promise((r) => setTimeout(r, 50));
    assert.equal(rt.joints.shoulder_pan_joint, 0.42);
    assert.equal(rt.joints.elbow_joint, -0.77);
    assert.equal(rt.joints.wrist_3_joint, 1.05);
    assert.equal(rt.source, 'rosbridge');

    ros.close();
  });

  it('advertises and publishes outbound JointState', async () => {
    const url = `ws://127.0.0.1:${port}`;
    const ros = new RosbridgeClient({ url, reconnectMs: 0 });

    const gotPublish = new Promise((resolve) => {
      const attach = (ws) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.op === 'publish' && msg.topic === '/joint_command') {
            resolve(msg);
          }
        });
      };
      wss.on('connection', attach);
      for (const ws of clients) attach(ws);
    });

    await new Promise((resolve) => {
      ros.on('status', (s) => { if (s === 'connected') resolve(); });
      ros.connect();
    });

    ros.advertise('/joint_command', 'sensor_msgs/JointState');
    ros.publish('/joint_command', 'sensor_msgs/JointState', {
      name: ['elbow_joint'],
      position: [1.23],
      velocity: [],
      effort: []
    });

    const msg = await Promise.race([
      gotPublish,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout waiting for publish')), 2000))
    ]);
    assert.equal(msg.type, 'sensor_msgs/JointState');
    assert.deepEqual(msg.msg.position, [1.23]);

    // Also via RobotRuntime onPublish hook
    const published = [];
    const rt = new RobotRuntime({
      jointsMeta: UR5E_JOINTS,
      publishTopic: '/joint_command',
      getRosbridgeStatus: () => 'connected',
      onPublish: (topic, type, m) => {
        published.push(m);
        ros.publish(topic, type, m);
      }
    });
    rt.applyCommand({ joints: { elbow_joint: 0.5 }, source: 'inject' });
    assert.equal(published.length, 1);
    assert.ok(published[0].name.includes('elbow_joint'));

    ros.close();
  });
});
