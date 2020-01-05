const customServices = require('./customServices');
const customCharacteristics = require('./customCharacteristics');

const fetch = require('node-fetch');
const storage = require('node-persist');
const packageJson = require('./package.json');
const express = require('express');

const MESSAGE_CODE_REQUIRED = 'Code required.';
const MESSAGE_CODE_INVALID = 'Code invalid.';
const MESSAGE_STATE_UPDATED = 'State updated.';

const app = express();

let Service, Characteristic, CustomService, CustomCharacteristic;
let homebridgePersistPath;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  CustomCharacteristic = customCharacteristics.CustomCharacteristic(Characteristic);
  CustomService = customServices.CustomService(Service, Characteristic, CustomCharacteristic);

  homebridgePersistPath = homebridge.user.persistPath();

  homebridge.registerAccessory('homebridge-securitysystem', 'Security system', SecuritySystem);
};

function SecuritySystem(log, config) {
  // Options
  this.log = log;
  this.name = config.name;
  this.defaultState = config.default_mode;
  this.armSeconds = config.arm_seconds;
  this.triggerSeconds = config.trigger_seconds;
  this.sirenSwitch = config.siren_switch;
  this.overrideOff = config.override_off;
  this.saveState = config.save_state;

  // Extra features
  this.serverPort = config.server_port;
  this.webhookUrl = config.webhook_url;

  // Variables
  this.webhook = false;
  this.armingTimeout = null;
  this.triggerTimeout = null;
  this.modeChanged = false;

  // Check for optional options
  if (this.defaultState === undefined) {
    this.defaultState = Characteristic.SecuritySystemCurrentState.DISARMED;
  }
  else {
    this.defaultState = this.defaultState.toLowerCase();

    switch (this.defaultState) {
      case 'home':
        this.defaultState = Characteristic.SecuritySystemCurrentState.STAY_ARM;
        break;

      case 'away':
        this.defaultState = Characteristic.SecuritySystemCurrentState.AWAY_ARM;
        break;

      case 'night':
        this.defaultState = Characteristic.SecuritySystemCurrentState.NIGHT_ARM;
        break;

      case 'off':
        this.defaultState = Characteristic.SecuritySystemCurrentState.DISARMED;
        break;

      default:
        this.log('Unknown default mode set in configuration.');
        this.defaultState = Characteristic.SecuritySystemCurrentState.DISARMED;
    }
  }

  if (this.armSeconds === undefined) {
    this.armSeconds = 0;
  }

  if (this.triggerSeconds === undefined) {
    this.triggerSeconds = 0;
  }

  if (this.sirenSwitch === undefined || this.sirenSwitch === true) {
    this.sirenSwitch = true;
  }
  else {
    this.sirenSwitch = false;
  }

  if (this.overrideOff === undefined) {
    this.overrideOff = false;
  }

  if (this.saveState === undefined) {
    this.saveState = false;
  }

  if (this.serverPort) {
    const code = config.server_code;
    
    // Authentication
    app.all('*', (req, res, next) => {
      // Skip authentication if code is not set
      if (code === undefined) {
        return next();
      }

      let userCode = req.query.code;

      // Check if code exists
      if (userCode === undefined) {
        this.log('Code required (Server)')
        return res.status(401).send(MESSAGE_CODE_REQUIRED);
      }

      // Check if code is a number
      userCode = parseInt(userCode);

      if (isNaN(code) || isNaN(userCode)) {
        this.log('Code invalid (Server)')
        return res.status(401).send(MESSAGE_CODE_INVALID);
      }

      // Compare codes
      if (userCode !== code) {
        this.log('Code invalid (Server)')
        return res.status(403).send(MESSAGE_CODE_INVALID);
      }

      return next();
    });

    // Routes
    app.get('/home', (req, res) => {
      this.service.setCharacteristic(
        Characteristic.SecuritySystemTargetState,
        Characteristic.SecuritySystemTargetState.STAY_ARM
      );

      res.send(MESSAGE_STATE_UPDATED);
    });

    app.get('/away', (req, res) => {
      this.service.setCharacteristic(
        Characteristic.SecuritySystemTargetState,
        Characteristic.SecuritySystemTargetState.AWAY_ARM
      );

      res.send(MESSAGE_STATE_UPDATED);
    });

    app.get('/night', (req, res) => {
      this.service.setCharacteristic(
        Characteristic.SecuritySystemTargetState,
        Characteristic.SecuritySystemTargetState.NIGHT_ARM
      );

      res.send(MESSAGE_STATE_UPDATED);
    });

    app.get('/off', (req, res) => {
      this.service.setCharacteristic(
        Characteristic.SecuritySystemTargetState,
        Characteristic.SecuritySystemTargetState.DISARM
      );

      res.send(MESSAGE_STATE_UPDATED);
    });

    app.get('/triggered', (req, res) => {
      this.setCurrentState(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
      res.send(MESSAGE_STATE_UPDATED);
    });

    // Server
    app.listen(this.serverPort, error => {
      if (error) {
        this.log('Error while starting server.');
        this.log(error);
        return;
      }
      
      this.log(`Server (${this.serverPort})`);
    });
  }

  if (this.webhookUrl) {
    this.webhook = true;

    this.webhookHome = config.webhook_home;
    this.webhookAway = config.webhook_away;
    this.webhookNight = config.webhook_night;
    this.webhookOff = config.webhook_off;
    this.webhookTriggered = config.webhook_triggered;
  }

  // Log options value
  this.logState('Default', this.defaultState);
  this.log('Arm delay (' + this.armSeconds + ' second/s)');
  this.log('Trigger delay (' + this.armSeconds + ' second/s)');

  if (this.sirenSwitch) {
    this.log('Siren switch (Enabled)');
  }

  if (this.webhook) {
    this.log('Webhook (' + this.webhookUrl + ')');
  }

  // Security system
  this.service = new CustomService.SecuritySystem(this.name);

  this.service
    .getCharacteristic(Characteristic.SecuritySystemTargetState)
    .on('get', this.getTargetState.bind(this))
    .on('set', this.setTargetState.bind(this));

  this.service
    .getCharacteristic(Characteristic.SecuritySystemCurrentState)
    .on('get', this.getCurrentState.bind(this));

  this.service
    .getCharacteristic(CustomCharacteristic.SecuritySystemArming)
    .on('get', this.getTargetState.bind(this));

  this.service
    .getCharacteristic(CustomCharacteristic.SecuritySystemSirenActive)
    .on('get', this.getSirenActive.bind(this))
    .on('set', this.setSirenActive.bind(this));

  this.currentState = this.defaultState;
  this.targetState = this.defaultState;
  this.arming = false;
  this.sirenActive = false;

  // Switch
  this.switchService = new Service.Switch('Siren');

  this.switchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSwitchState.bind(this))
    .on('set', this.setSwitchState.bind(this));

  this.switchOn = false;

  // Accessory information
  this.accessoryInformationService = new Service.AccessoryInformation();

  this.accessoryInformationService.setCharacteristic(Characteristic.Identify, true);
  this.accessoryInformationService.setCharacteristic(Characteristic.Manufacturer, 'MiguelRipoll23');
  this.accessoryInformationService.setCharacteristic(Characteristic.Model, 'Generic');
  this.accessoryInformationService.setCharacteristic(Characteristic.Name, 'homebridge-securitysystem');
  this.accessoryInformationService.setCharacteristic(Characteristic.SerialNumber, 'Generic');
  this.accessoryInformationService.setCharacteristic(Characteristic.FirmwareRevision, packageJson.version);

  // Services
  this.services = [
    this.service,
    this.accessoryInformationService
  ];

  if (this.sirenSwitch) {
    this.services.push(this.switchService);
  }

  // Storage
  if (this.saveState) {
    this.load();
  }
}

SecuritySystem.prototype.load = async function() {
  const options = {
    'dir': homebridgePersistPath,
    'forgiveParseErrors': true
  };

  await storage.init(options)
    .then()
    .catch((error) => {
      this.log('Unable to initialize storage.');
      this.log(error);
    });

  if (storage.defaultInstance === undefined) {
    return;
  }
  
  await storage.getItem('state')
    .then(state => {
      if (state === undefined) {
        return;
      }

      this.currentState = state.currentState;
      this.targetState = state.targetState;
      this.sirenActive = state.sirenActive;
      this.switchOn = state.switchOn;

      this.logState('Saved', this.currentState);
    })
    .catch(error => {
      this.log('Unable to load state.');
      this.log(error);
    });
};

SecuritySystem.prototype.save = async function() {
  if (storage.defaultInstance === undefined) {
    return;
  }

  const state = {
    'currentState': this.currentState,
    'targetState': this.targetState,
    'sirenActive': this.sirenActive,
    'switchOn': this.switchOn
  };

  await storage.setItem('state', state)
    .then()
    .catch(error => {
      this.log('Unable to save state.');
      this.log(error);
    });
};

SecuritySystem.prototype.identify = function(callback) {
  this.log('Identify');
  callback(null);
};

// Security system
SecuritySystem.prototype.logState = function(type, state) {
  switch (state) {
    case Characteristic.SecuritySystemCurrentState.STAY_ARM:
      this.log(type + ' state (Home)');
      break;

    case Characteristic.SecuritySystemCurrentState.AWAY_ARM:
      this.log(type + ' state (Away)');
      break;

    case Characteristic.SecuritySystemCurrentState.NIGHT_ARM:
      this.log(type + ' state (Night)');
      break;

    case Characteristic.SecuritySystemCurrentState.DISARMED:
      this.log(type + ' state (Off)');
      break;

    case Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED:
      this.log(type + ' state (Alarm triggered)');
      break;

    default:
      this.log(type + ' state (Unknown state)');
  }
};

SecuritySystem.prototype.getCurrentState = function(callback) {
  callback(null, this.currentState);
};

SecuritySystem.prototype.setCurrentState = function(state) {
  this.currentState = state;
  this.service.setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
  this.logState('Current', state);

  // Save state to file
  if (this.saveState) {
    this.save();
  }

  // Webhook
  if (this.webhook) {
    this.sendWebhookEvent(state);
  }
};

SecuritySystem.prototype.getTargetState = function(callback) {
  callback(null, this.targetState);
};

SecuritySystem.prototype.setTargetState = function(state, callback) {
  this.targetState = state;
  this.logState('Target', state);

  // Save state to file
  if (this.saveState) {
    this.save();
  }

  // Set security system to mode
  // selected from the user
  // during triggered state
  if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    this.service.getCharacteristic(CustomCharacteristic.SecuritySystemSirenActive).updateValue(false);
    this.modeChanged = true;
  }

  // Cancel pending or triggered alarm
  // if switching to a mode
  if (this.switchOn) {
    this.switchOn = false;
    this.switchService.setCharacteristic(Characteristic.On, this.switchOn);
  }

  // Clear timeout
  if (this.armingTimeout !== null) {
    clearTimeout(this.armingTimeout);
  }

  // Update current state
  let armSeconds = 0;

  // Add arm delay if alarm is not triggered
  if (this.currentState !== Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    // Only if set to a mode excluding off
    if (state !== Characteristic.SecuritySystemCurrentState.DISARMED) {
      armSeconds = this.armSeconds;

      // Update arming status
      this.arming = true;
      this.service.getCharacteristic(CustomCharacteristic.SecuritySystemArming).updateValue(this.arming);
    }
  }

  // Update current state
  this.armingTimeout = setTimeout(() => {
    this.armingTimeout = null;
    this.setCurrentState(state);

    // Only if set to a mode excluding off
    if (state !== Characteristic.SecuritySystemCurrentState.DISARMED) {
      this.arming = false;
      this.service.getCharacteristic(CustomCharacteristic.SecuritySystemArming).updateValue(this.arming);
    }
  }, armSeconds * 1000);

  callback(null);
};

SecuritySystem.prototype.getArming = function(callback) {
  callback(null, this.arming);
};

SecuritySystem.prototype.getSirenActive = function(callback) {
  callback(null, this.sirenActive);
};

SecuritySystem.prototype.setSirenActive = function(state, callback) {
  this.sirenActive = state;
  this.sensorTriggered(state, callback);
};

SecuritySystem.prototype.sensorTriggered = function(state, callback) {
  // Save state to file
  if (this.saveState) {
    this.save();
  }

  // Ignore if the security system
  // mode is off
  if (this.currentState === Characteristic.SecuritySystemCurrentState.DISARMED) {
    if (this.overrideOff === false) {
      if (callback !== null) {
        callback('Security system not armed.');
      }
  
      return;
    }
  }

  // Ignore if the security system
  // is arming
  if (this.armingTimeout !== null) {
    if (callback !== null) {
      callback('Security system not yet armed.');
    }

    return;
  }

  if (state) {
    // On
    if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
      // Ignore since alarm
      // is already triggered
    }
    else {
      this.log('Sensor/s (Triggered)');

      this.triggerTimeout = setTimeout(() => {
        // Reset
        this.triggerTimeout = null;
        this.modeChanged = false;

        // 🎵 And there goes the alarm... 🎵
        this.setCurrentState(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
      }, this.triggerSeconds * 1000);
    }
  }
  else {
    // Off
    this.service.getCharacteristic(CustomCharacteristic.SecuritySystemSirenActive).updateValue(false);

    if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
      if (this.modeChanged === false) {
        this.service.setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.DISARM);
      }
    }
    else {
      if (this.triggerTimeout !== null) {
        clearTimeout(this.triggerTimeout);
        this.triggerTimeout = null;

        this.log('Sensor/s (Cancelled)');
      }
    }
  }

  // Save state to file
  if (this.saveState) {
    this.save();
  }

  callback(null);
};

SecuritySystem.prototype.sendWebhookEvent = function(state) {
  let path = null;

  switch (state) {
    case Characteristic.SecuritySystemCurrentState.STAY_ARM:
      path = this.webhookHome;
      break;

    case Characteristic.SecuritySystemCurrentState.AWAY_ARM:
      path = this.webhookAway;
      break;

    case Characteristic.SecuritySystemCurrentState.NIGHT_ARM:
      path = this.webhookNight;
      break;

    case Characteristic.SecuritySystemCurrentState.DISARMED:
      path = this.webhookOff;
      break;

    case Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED:
      path = this.webhookTriggered;
      break;
  }

  if (path === undefined || path === null) {
    this.log('Missing webhook path for target state.');
    return;
  }

  // Send GET request to server
  fetch(this.webhookUrl + path)
    .then(response => {
      if (!response.ok) {
        throw new Error('Status code (' + response.statusCode + ')');
      }

      this.log('Webhook event (Sent)');
    })
    .catch(error => {
      this.log('Request to webhook failed. (' + path + ')');
      this.log(error);
    });
};

// Switch
SecuritySystem.prototype.getSwitchState = function(callback) {
  callback(null, this.switchOn);
};

SecuritySystem.prototype.setSwitchState = function(state, callback) {
  this.switchOn = state;
  this.sensorTriggered(state, callback);
};

// Accessory
SecuritySystem.prototype.getServices = function() {
  return this.services;
};
