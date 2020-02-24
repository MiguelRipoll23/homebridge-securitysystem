const customServices = require('./customServices');
const customCharacteristics = require('./customCharacteristics');

const { exec } = require('child_process');
const fetch = require('node-fetch');
const storage = require('node-persist');
const packageJson = require('./package.json');
const express = require('express');

const MESSAGE_CODE_REQUIRED = 'Code required.';
const MESSAGE_CODE_INVALID = 'Code invalid.';
const MESSAGE_STATE_DISABLED = 'Mode disabled.';
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

function isOptionSet(value) {
  if (value === undefined || value === null) {
    return false;
  }

  return true;
}

function SecuritySystem(log, config) {
  // Options
  this.log = log;
  this.name = config.name;
  this.defaultMode = config.default_mode;
  this.disabledModes = config.disabled_modes;
  this.armSeconds = config.arm_seconds;
  this.triggerSeconds = config.trigger_seconds;
  this.sirenSwitch = config.siren_switch;
  this.overrideOff = config.override_off;
  this.saveState = config.save_state;

  // Extra features
  this.serverPort = config.server_port;
  this.webhookUrl = config.webhook_url;
  this.command = config.command;

  // Variables
  this.defaultState = null;
  this.targetStates = null;
  this.armingTimeout = null;
  this.triggerTimeout = null;
  this.modeChanged = false;
  this.webhook = false;

  // Check for optional options
  if (isOptionSet(this.defaultMode)) {
    this.defaultMode = this.defaultMode.toLowerCase();
    this.defaultState = this.mode2State(this.defaultMode);
  }
  else {
    this.defaultState = Characteristic.SecuritySystemCurrentState.DISARMED;
  }

  if (isOptionSet(this.disabledModes) === false) {
    this.disabledModes = [];
  }

  if (isOptionSet(this.armSeconds) === false) {
    this.armSeconds = 0;
  }

  if (isOptionSet(this.triggerSeconds) === false) {
    this.triggerSeconds = 0;
  }

  if (isOptionSet(this.sirenSwitch)) {
    if (this.sirenSwitch) {
      this.sirenSwitch = true;
    }
    else {
      this.sirenSwitch = false;
    }
  }
  else {
    this.sirenSwitch = true;
  }

  if (isOptionSet(this.overrideOff) && this.overrideOff) {
    this.overrideOff = true;
  }
  else {
    this.overrideOff = false;
  }

  if (isOptionSet(this.saveState) && this.saveState) {
    this.saveState = true;
  }
  else {
    this.saveState = false;
  }

  if (isOptionSet(this.serverPort)) {
    this.serverCode = config.server_code;
    this.serverArmDelay = config.server_arm_delay;

    if (this.serverArmDelay === undefined) {
      this.serverArmDelay = true;
    }

    this.startServer();
  }

  if (isOptionSet(this.webhookUrl)) {
    this.webhook = true;

    this.webhookHome = config.webhook_home;
    this.webhookAway = config.webhook_away;
    this.webhookNight = config.webhook_night;
    this.webhookOff = config.webhook_off;
    this.webhookTriggered = config.webhook_triggered;
  }
  else {
    this.webhook = false;
  }

  if (isOptionSet(this.command) && this.command) {
    this.commandHome = config.command_home;
    this.commandAway = config.command_away;
    this.commandNight = config.command_night;
    this.commandOff = config.command_off;
    this.commandTriggered = config.command_triggered;
  }
  else {
    this.command = false;
  }

  // Log options value
  this.logState('Default', this.defaultState);
  this.log('Arm delay (' + this.armSeconds + ' second/s)');
  this.log('Trigger delay (' + this.armSeconds + ' second/s)');

  if (this.webhook) {
    this.log('Webhook (' + this.webhookUrl + ')');
  }

  // Security system
  this.service = new CustomService.SecuritySystem(this.name);
  this.targetStates = this.getTargetStates();

  // Services
  this.service
    .getCharacteristic(Characteristic.SecuritySystemTargetState)
    .setProps({validValues: this.targetStates})
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
SecuritySystem.prototype.mode2State = function(mode) {
  switch (mode) {
    case 'home':
      return Characteristic.SecuritySystemCurrentState.STAY_ARM;

    case 'away':
      return Characteristic.SecuritySystemCurrentState.AWAY_ARM;

    case 'night':
      return Characteristic.SecuritySystemCurrentState.NIGHT_ARM;
      
    case 'off':
      return Characteristic.SecuritySystemCurrentState.DISARMED;

    default:
      this.log(`Unknown mode (${mode}).`);
      return -1;
  }
};

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

SecuritySystem.prototype.getTargetStates = function() {
  const targetStateCharacteristic = this.service.getCharacteristic(Characteristic.SecuritySystemTargetState);
  const targetStates = targetStateCharacteristic.props.validValues;

  const disabledStates = [];

  for (let disabledMode of this.disabledModes) {
    disabledMode = disabledMode.toLowerCase();

    const state = this.mode2State(disabledMode);
    disabledStates.push(state);
  }

  return targetStates.filter(mode => !disabledStates.includes(mode));
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

  // Command
  if (this.command) {
    this.executeCommand(state);
  }

  // Webhook
  if (this.webhook) {
    this.sendWebhookEvent(state);
  }
};

SecuritySystem.prototype.handleStateChange = function() {
  // Save state to file
  if (this.saveState) {
    this.save();
  }

  // Set security system to mode
  // selected from the user
  // during triggered state
  if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    this.service
      .getCharacteristic(CustomCharacteristic.SecuritySystemSirenActive)
      .updateValue(false);
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
};

SecuritySystem.prototype.getTargetState = function(callback) {
  callback(null, this.targetState);
};

SecuritySystem.prototype.setTargetState = function(state, callback) {
  this.targetState = state;
  this.logState('Target', state);
  this.handleStateChange();

  let armSeconds = 0;

  // Add arm delay if alarm is not triggered
  if (this.currentState !== Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    // Only if set to a mode excluding off
    if (state !== Characteristic.SecuritySystemCurrentState.DISARMED) {
      armSeconds = this.armSeconds;

      // Update arming status
      this.arming = true;
      this.service
        .getCharacteristic(CustomCharacteristic.SecuritySystemArming)
        .updateValue(this.arming);
    }
  }

  // Update current state
  this.armingTimeout = setTimeout(() => {
    this.armingTimeout = null;
    this.setCurrentState(state);

    // Only if set to a mode excluding off
    if (state !== Characteristic.SecuritySystemCurrentState.DISARMED) {
      this.arming = false;
      this.service
        .getCharacteristic(CustomCharacteristic.SecuritySystemArming)
        .updateValue(this.arming);
    }
  }, armSeconds * 1000);

  callback(null);
};

SecuritySystem.prototype.updateTargetState = function(state) {
  this.targetState = state;
  this.logState('Target', state);

  this.service
  .getCharacteristic(Characteristic.SecuritySystemTargetState)
  .updateValue(this.targetState);

  this.handleStateChange();

  let armSeconds = 0;

  // Add arm delay if alarm is not triggered
  if (this.currentState !== Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    // Only if set to a mode excluding off
    if (state !== Characteristic.SecuritySystemCurrentState.DISARMED) {
      // Only if server arm delay is enabled
      if (this.serverArmDelay === true) {
        armSeconds = this.armSeconds;

        // Update arming status
        this.arming = true;
        this.service
          .getCharacteristic(CustomCharacteristic.SecuritySystemArming)
          .updateValue(this.arming);
      }
    }
  }

  // Update current state
  this.armingTimeout = setTimeout(() => {
    this.armingTimeout = null;
    this.setCurrentState(state);

    // Only if set to a mode excluding off
    if (state !== Characteristic.SecuritySystemCurrentState.DISARMED) {
      this.arming = false;
      this.service
        .getCharacteristic(CustomCharacteristic.SecuritySystemArming)
        .updateValue(this.arming);
    }
  }, armSeconds * 1000);
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

SecuritySystem.prototype.isAuthenticated = function(req, res) {
  let userCode = req.query.code;

  // Skip authentication if disabled
  if (this.serverCode === undefined) {
    return true;
  }

  // Check if code was sent
  if (userCode === undefined) {
    this.log('Code required (Server)')
    res.status(401).send(MESSAGE_CODE_REQUIRED);

    return false;
  }

  // Compare codes
  userCode = parseInt(userCode);

  if (userCode !== this.serverCode) {
    this.log('Code invalid (Server)')
    res.status(403).send(MESSAGE_CODE_INVALID);

    return false;
  }

  return true;
};

SecuritySystem.prototype.isModeEnabled = function(req, res) {
  const mode = req.path.substring(1);
  const state = this.mode2State(mode);

  if (this.targetStates.includes(state)) {
    return true;
  }
  
  res.status(400).send(MESSAGE_STATE_DISABLED);
  return false;
};

SecuritySystem.prototype.startServer = async function() {
  app.get('/home', (req, res) => {
    if (this.isAuthenticated(req, res) === false) {
      return false;
    }

    if (this.isModeEnabled(req, res) === false) {
      return false;
    }

    this.updateTargetState(Characteristic.SecuritySystemTargetState.STAY_ARM);
    res.send(MESSAGE_STATE_UPDATED);
  });

  app.get('/away', (req, res) => {
    if (this.isAuthenticated(req, res) === false) {
      return false;
    }

    if (this.isModeEnabled(req, res) === false) {
      return false;
    }

    this.updateTargetState(Characteristic.SecuritySystemTargetState.AWAY_ARM);
    res.send(MESSAGE_STATE_UPDATED);
  });

  app.get('/night', (req, res) => {
    if (this.isAuthenticated(req, res) === false) {
      return false;
    }

    if (this.isModeEnabled(req, res) === false) {
      return false;
    }

    this.updateTargetState(Characteristic.SecuritySystemTargetState.NIGHT_ARM);
    res.send(MESSAGE_STATE_UPDATED);
  });

  app.get('/off', (req, res) => {
    if (this.isAuthenticated(req, res) === false) {
      return false;
    }

    if (this.isModeEnabled(req, res) === false) {
      return false;
    }

    this.updateTargetState(Characteristic.SecuritySystemTargetState.DISARM);
    res.send(MESSAGE_STATE_UPDATED);
  });

  app.get('/triggered', (req, res) => {
    // Check authentication
    if (this.isAuthenticated(req, res) === false) {
      return false;
    }

    this.setCurrentState(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
    res.send(MESSAGE_STATE_UPDATED);
  });

  // Listener
  app.listen(this.serverPort, error => {
    if (error) {
      this.log('Error while starting server.');
      this.log(error);
      return;
    }
    
    this.log(`Server (${this.serverPort})`);
  });
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

    default:
      this.log(`Unknown target state. (${state})`);
      return;
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

SecuritySystem.prototype.executeCommand = function(state) {
  let command = null;

  switch (state) {
    case Characteristic.SecuritySystemCurrentState.STAY_ARM:
      command = this.commandHome;
      break;

    case Characteristic.SecuritySystemCurrentState.AWAY_ARM:
      command = this.commandAway;
      break;

    case Characteristic.SecuritySystemCurrentState.NIGHT_ARM:
      command = this.commandNight;
      break;

    case Characteristic.SecuritySystemCurrentState.DISARMED:
      command = this.commandOff;
      break;

    case Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED:
      command = this.commandTriggered;
      break;

    default:
      this.log(`Unknown target state. (${state})`);
  }

  if (command === undefined || command === null) {
    this.log(`Missing command for target state.`);
    return;
  }

  exec(command, (error, stdout, stderr) => {
    if (error !== null) {
      this.log(`Command failed. (${command})\n${error}`);
      return;
    }

    if (stderr !== '') {
      this.log(`Command failed. (${command})\n${stderr}`);
    }
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
