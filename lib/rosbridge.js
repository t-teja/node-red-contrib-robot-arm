'use strict';

const { EventEmitter } = require('events');
const WebSocket = require('ws');

/**
 * Minimal rosbridge WebSocket client for Node-RED robot node.
 * Supports connect, subscribe, publish, reconnect, and status events.
 */
class RosbridgeClient extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.url - e.g. ws://localhost:9090
   * @param {number} [opts.reconnectMs=3000]
   */
  constructor(opts = {}) {
    super();
    this.url = opts.url || 'ws://localhost:9090';
    this.reconnectMs = opts.reconnectMs != null ? opts.reconnectMs : 3000;
    this._ws = null;
    this._closed = false;
    this._id = 0;
    this._subs = new Map(); // topic -> { type, cb, id }
    this._reconnectTimer = null;
    this.status = 'disconnected';
  }

  _setStatus(s) {
    this.status = s;
    this.emit('status', s);
  }

  _nextId() {
    this._id += 1;
    return `nra_${this._id}`;
  }

  connect() {
    this._closed = false;
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this._clearReconnect();
    this._setStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this._setStatus('error');
      this.emit('error', err);
      this._scheduleReconnect();
      return;
    }
    this._ws = ws;

    ws.on('open', () => {
      this._setStatus('connected');
      // re-subscribe
      for (const [topic, sub] of this._subs.entries()) {
        this._send({
          op: 'subscribe',
          id: sub.id,
          topic,
          type: sub.type
        });
      }
    });

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (_) {
        return;
      }
      if (msg.op === 'publish' && msg.topic && this._subs.has(msg.topic)) {
        const sub = this._subs.get(msg.topic);
        try {
          sub.cb(msg.msg, msg.topic);
        } catch (err) {
          this.emit('error', err);
        }
      }
    });

    ws.on('close', () => {
      this._ws = null;
      if (!this._closed) {
        this._setStatus('disconnected');
        this._scheduleReconnect();
      } else {
        this._setStatus('closed');
      }
    });

    ws.on('error', (err) => {
      this.emit('error', err);
    });
  }

  _send(obj) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  /**
   * @param {string} topic
   * @param {string} type - ROS message type e.g. sensor_msgs/JointState
   * @param {function} cb - (msg, topic) => void
   */
  subscribe(topic, type, cb) {
    const id = this._nextId();
    this._subs.set(topic, { type, cb, id });
    this._send({ op: 'subscribe', id, topic, type });
  }

  unsubscribe(topic) {
    const sub = this._subs.get(topic);
    if (sub) {
      this._send({ op: 'unsubscribe', id: sub.id, topic });
      this._subs.delete(topic);
    }
  }

  /**
   * @param {string} topic
   * @param {string} type
   * @param {object} msg
   */
  publish(topic, type, msg) {
    this._send({
      op: 'publish',
      topic,
      msg,
      type
    });
  }

  _scheduleReconnect() {
    if (this._closed || this.reconnectMs <= 0) return;
    this._clearReconnect();
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._closed) this.connect();
    }, this.reconnectMs);
  }

  _clearReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  close() {
    this._closed = true;
    this._clearReconnect();
    for (const topic of [...this._subs.keys()]) {
      this.unsubscribe(topic);
    }
    if (this._ws) {
      try { this._ws.close(); } catch (_) { /* ignore */ }
      this._ws = null;
    }
    this._setStatus('closed');
  }
}

module.exports = { RosbridgeClient };
