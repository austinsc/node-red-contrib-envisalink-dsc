'use strict';
const net = require('net');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const tpidefs = require('./tpi.js');

function EnvisaLink(config) {
  EventEmitter.call(this);
  this.options = {
    host: config.host,
    port: config.port,
    password: config.password,
    zones: config.zones,
    partitions: config.partitions
  };
}

util.inherits(EnvisaLink, EventEmitter);
module.exports = EnvisaLink;

EnvisaLink.prototype.connect = function () {
  const _this = this;
  this.zones = {};
  this.partitions = {};
  this.users = {};
  this.systems = undefined;
  this.connection = net.connect({ port: this.options.port, host: this.options.host }, function () {
    // do nothing
  });

  this.connection.on('error', function (ex) {
    _this.emit('error', ex);
  });

  this.connection.on('end', function () {
    _this.emit('disconnect');
  });

  this.connection.on('data', function (data) {
    const dataslice = data.toString().replace(/[\n\r]/g, ',').split(',');

    for (let i = 0; i < dataslice.length; i++) {
      const datapacket = dataslice[i];
      if (datapacket !== '') {
        const tpi = tpidefs[datapacket.substring(0, 3)];
        if (tpi) {
          if (tpi.bytes === '' || tpi.bytes === 0) {
            _this.emit('log-warn', tpi.pre + ' - ' + tpi.post);
          } else {
            _this.emit('log-debug', tpi.pre + ' ' + datapacket.substring(3, datapacket.length - 2) + ' ' + tpi.post);
            if (tpi.action === 'updatezone') {
              updateZone(tpi, datapacket);
            } else if (tpi.action === 'updatepartition') {
              updatePartition(tpi, datapacket);
            } else if (tpi.action === 'updatepartitionuser') {
              updatePartitionUser(tpi, datapacket);
            } else if (tpi.action === 'updatesystem') {
              updateSystem(tpi, datapacket);
            } else if (tpi.action === 'loginresponse') {
              loginResponse(datapacket);
            }
          }
        }
      }
    }
  });

  function loginResponse(data) {
    const loginStatus = data.substring(3, 4);
    if (loginStatus === '0') {
      _this.emit('log-debug', 'Incorrect password');
    } else if (loginStatus === '1') {
      _this.emit('connected');
      _this.emit('log-debug', 'Successfully logged in. Requesting current state.');
      _this.sendCommand('001');
    } else if (loginStatus === '2') {
      _this.emit('log-debug', 'Request for password timed out.');
    } else if (loginStatus === '3') {
      _this.emit('log-debug', 'Login requested. Sending response. ' + _this.options.password);
      _this.sendCommand('005' + _this.options.password);
    }
  }

  function updateZone(tpi, data) {
    const zone = parseInt(data.substring(3, 6));
    const initialUpdate = _this.zones[zone] === undefined;
    _this.emit('log-debug', 'Zone: ' + zone + ', options: ' + _this.options.zones);
    if (zone <= _this.options.zones) {
      _this.zones[zone] = { send: tpi.send, name: tpi.name, code:data };
      _this.emit('zoneupdate',
        { zone: parseInt(data.substring(3, 6)), code: data.substring(0, 3),
          status: tpi.name, initialUpdate: initialUpdate, });
    }
  }

  function updatePartition(tpi, data) {
    const partition = parseInt(data.substring(3, 4));
    const initialUpdate = _this.partitions[partition] === undefined;
    if (partition <= _this.options.partitions) {
      _this.partitions[partition] = { send: tpi.send, name: tpi.name, code: data };
      if (data.substring(0, 3) === '652') {
        const modeCode = data.substring(4, 5);
        const mode = modeToHumanReadable(modeCode);
        _this.emit('partitionupdate',
          { partition: parseInt(data.substring(3, 4)),
            code: data.substring(0, 3), modeCode: modeCode,
            mode: mode, status: tpi.name, initialUpdate: initialUpdate, });
      } else {
        _this.emit('partitionupdate',
          { partition: parseInt(data.substring(3, 4)),
            code: data.substring(0, 3), status: tpi.name, initialUpdate: initialUpdate, });
      }
    }
  }

  function modeToHumanReadable(mode) {
    if (mode === 0) return 'AWAY';
    else if (mode === 1) return 'STAY';
    else if (mode === 2) return 'ZERO-ENTRY-AWAY';
    else return 'ZERO-ENTRY-STAY';
  }

  function updatePartitionUser(tpi, data) {
    const partition = parseInt(data.substring(3, 4));
    const user = parseInt(data.substring(4, 8));
    const initialUpdate = _this.users[user] === undefined;
    if (partition <= _this.options.partitions) {
      _this.users[user] = { send: tpi.send, name: tpi.name, code: data };
      _this.emit('partitionuserupdate',
      { partition: parseInt(data.substring(3, 4)), code: data.substring(0, 3),
        user: user, status: tpi.name, initialUpdate: initialUpdate, });
    }
  }

  function updateSystem(tpi, data) {
    _this.systems = { send: tpi.send, name: tpi.name, code: data };
    _this.emit('systemupdate', { code: data.substring(0, 3), status: tpi.name, });
  }
};

EnvisaLink.prototype.disconnect = function () {
  if (this.connection && !this.connection.destroyed) {
    this.connection.end();
    return false;
  } else {
    return true;
  }
};

EnvisaLink.prototype.sendCommand = function (command) {
  let checksum = 0;
  for (let i = 0; i < command.length; i++) {
    checksum += command.charCodeAt(i);
  }
  checksum = checksum.toString(16).slice(-2).toUpperCase();
  this.connection.write(command + checksum + '\r\n');
  _this.emit('log-debug', 'Sending: ' + command + checksum + '\\r\\n');
};