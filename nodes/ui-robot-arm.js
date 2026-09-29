'use strict';

module.exports = function (RED) {
  function UIRobotArmNode (config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const group = RED.nodes.getNode(config.group);

    const evts = {
      onAction: true,
      onInput: function (msg, send, done) {
        send(msg);
        if (done) done();
      }
    };

    if (group) {
      group.register(node, config, evts);
    } else {
      node.error('No group configured — add ui-ur5e-arm to a Dashboard 2 ui-group');
    }
  }

  RED.nodes.registerType('ui-ur5e-arm', UIRobotArmNode);
};
