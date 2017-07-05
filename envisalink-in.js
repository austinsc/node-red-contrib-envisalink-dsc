'use strict';

module.exports = function (RED) {
  function EnvisaLinkInNode(config) {
    RED.nodes.createNode(this, config);
    const _this = this;
    this.controller = config.controller;
    this.controllerConn = RED.nodes.getNode(this.controller);

    if (this.controllerConn) {
      this.status({ fill: 'orange', shape: 'ring', text: 'Connecting...' });
      this.controllerConn.register(this);
    } else {
      this.error(RED._('Missing controller configuration'));
    }

    this.on('el-zoneupdate', function (update) {
      if (!update.initialUpdate) {
        delete update.initialUpdate;
        const msg = {topic: 'zone event', payload: update};
        _this.send(msg);
      }
    });

    this.on('el-partitionupdate', function (update) {
      if (!update.initialUpdate) {
        delete update.initialUpdate;
        const msg = {topic: 'partition event', payload: update};
        _this.send(msg);
      }
    });

    this.on('el-systemupdate', function (update) {
      if (!update.initialUpdate) {
        delete update.initialUpdate;
        const msg = {topic: 'system event', payload: update};
        _this.send(msg);
      }
    });

    this.on('close', function (done) {
       if (_this.controllerConn) {
         _this.controllerConn.deregister(_this, done);
       }
     });
  }

  RED.nodes.registerType('envisalink-in', EnvisaLinkInNode);
};
