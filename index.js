const path = require('path');
const { exec } = require('child_process');
const packageJson = require('./package.json');

const fetch = require('node-fetch');
const storage = require('node-persist');
const express = require('express');

const customServices = require('./custom/customServices');
const customCharacteristics = require('./custom/customCharacteristics');

const app = express();

const MAX_CODE_ATTEMPTS = 25;
const MESSAGE_CODE_REQUIRED = 'Code required';
const MESSAGE_CODE_INVALID = 'Code invalid';
const MESSAGE_CODE_BLOCKED = 'Code blocked';
const MESSAGE_MODE_DISABLED = 'Mode disabled';

let Service, Characteristic, CustomService, CustomCharacteristic;
let homebridgeStoragePath;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  CustomCharacteristic = customCharacteristics.CustomCharacteristic(Characteristic);
  CustomService = customServices.CustomService(Service, Characteristic, CustomCharacteristic);

  homebridgeStoragePath = homebridge.user.storagePath();

  homebridge.registerAccessory('homebridge-securitysystem', 'security-system', SecuritySystem);
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
  this.sirenModeSwitches = config.siren_mode_switches;
  this.overrideOff = config.override_off;
  this.saveState = config.save_state;

  // Optional: server
  this.serverPort = config.server_port;
  this.serverCode = config.server_code;

  // Optional: webhook
  this.webhookUrl = config.webhook_url;

  // Optiona: commands
  this.commandTargetHome = config.command_target_home;
  this.commandTargetAway = config.command_target_away;
  this.commandTargetNight = config.command_target_night;

  this.commandCurrentHome = config.command_current_home;
  this.commandCurrentAway = config.command_current_away;
  this.commandCurrentNight = config.command_current_night;
  
  this.commandOff = config.command_off;
  this.commandTriggered = config.command_triggered;

  this.commandAlert = config.command_alert;

  // Variables
  this.defaultState = null;
  this.targetStates = null;
  this.armingTimeout = null;
  this.triggerTimeout = null;
  this.modeChanged = false;
  this.invalidCodeAttempts = 0;
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

  if (!isOptionSet(this.sirenSwitch)) {
    this.sirenSwitch = true;
  }

  if (!isOptionSet(this.sirenModeSwitches)) {
    this.sirenModeSwitches = false;
  }

  if (!isOptionSet(this.overrideOff)) {
    this.overrideOff = false;
  }

  if (!isOptionSet(this.saveState)) {
    this.saveState = false;
  }

  if (isOptionSet(this.serverPort)) {
    this.serverCode = config.server_code;

    if (this.serverPort < 0 || this.serverPort > 65535) {
      this.log('Server port is invalid.');
    }
    else {
      this.startServer();
    }
  }

  if (isOptionSet(this.webhookUrl)) {
    this.webhook = true;
    
    this.webhookTargetHome = config.webhook_target_home;
    this.webhookTargetAway = config.webhook_target_away;
    this.webhookTargetNight = config.webhook_target_night;

    this.webhookCurrentHome = config.webhook_current_home;
    this.webhookCurrentAway = config.webhook_current_away;
    this.webhookCurrentNight = config.webhook_current_night;

    this.webhookOff = config.webhook_off;
    this.webhookTriggered = config.webhook_triggered;

    this.webhookAlert = config.webhook_alert;
  }
  else {
    this.webhook = false;
  }

  // Log options value
  this.logState('Default', this.defaultState);
  this.log('Arm delay (' + this.armSeconds + ' second/s)');
  this.log('Trigger delay (' + this.triggerSeconds + ' second/s)');

  if (this.webhook) {
    this.log('Webhook (' + this.webhookUrl + ')');
  }

  // Security system
  this.service = new CustomService.SecuritySystem(this.name);
  this.targetStates = this.getEnabledStates();

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

  // Siren Switch (Optional)
  this.sirenService = new Service.Switch('Siren', 'siren');

  this.sirenService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenState.bind(this))
    .on('set', this.setSirenState.bind(this));

  this.sirenOn = false;

  // Siren Mode switches (Optional)
  this.sirenHomeService = new Service.Switch('Siren Home', 'siren-home');

  this.sirenHomeService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenHomeState.bind(this))
    .on('set', this.setSirenHomeState.bind(this));

  this.sirenHomeOn = false;

  this.sirenAwayService = new Service.Switch('Siren Away', 'siren-away');

  this.sirenAwayService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenAwayState.bind(this))
    .on('set', this.setSirenAwayState.bind(this));

  this.sirenAwayOn = false;

  this.sirenNightService = new Service.Switch('Siren Night', 'siren-night');

  this.sirenNightService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenNightState.bind(this))
    .on('set', this.setSirenNightState.bind(this));

  this.sirenNightState = false;

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
    this.services.push(this.sirenService);
  }

  if (this.sirenModeSwitches) {
    if (this.targetStates.includes(Characteristic.SecuritySystemTargetState.STAY_ARM)) {
      this.services.push(this.sirenHomeService);
    }

    if (this.targetStates.includes(Characteristic.SecuritySystemTargetState.AWAY_ARM)) {
      this.services.push(this.sirenAwayService);
    }

    if (this.targetStates.includes(Characteristic.SecuritySystemTargetState.NIGHT_ARM)) {
      this.services.push(this.sirenNightService);
    }
  }

  // Storage
  if (this.saveState) {
    this.load();
  }
}

SecuritySystem.prototype.load = async function() {
  const options = {
    'dir': path.join(homebridgeStoragePath, 'homebridge-securitysystem')
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
      this.sirenOn = state.sirenOn;

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
    'sirenOn': this.sirenOn
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
SecuritySystem.prototype.state2Mode = function(state) {
  switch (state) {
    case Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED:
      return 'triggered';

    case Characteristic.SecuritySystemCurrentState.STAY_ARM:
      return 'home';

    case Characteristic.SecuritySystemCurrentState.AWAY_ARM:
      return 'away';

    case Characteristic.SecuritySystemCurrentState.NIGHT_ARM:
      return 'night';
      
    case Characteristic.SecuritySystemCurrentState.DISARMED:
      return 'off';

    default:
      this.log(`Unknown state (${state}).`);
      return 'unknown';
  }
};

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
  let mode = this.state2Mode(state);
  mode = mode.charAt(0).toUpperCase() + mode.slice(1);

  this.log(`${type} state (${mode})`);
};

SecuritySystem.prototype.getEnabledStates = function() {
  const targetStateCharacteristic = this.service.getCharacteristic(Characteristic.SecuritySystemTargetState);
  const targetStates = targetStateCharacteristic.props.validValues;

  const disabledStates = [];

  for (let disabledMode of this.disabledModes) {
    const state = this.mode2State(disabledMode.toLowerCase());
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
  // Check if mode already set
  if (this.currentState === state) {
    return;
  }

  this.currentState = state;
  this.service.setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
  this.logState('Current', state);

  // Save state to file
  if (this.saveState) {
    this.save();
  }

  this.executeCommand('current', state);

  if (this.webhook) {
    this.sendWebhookEvent('current', state);
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
  if (this.sirenOn) {
    this.sirenOn = false;
    this.sirenService.setCharacteristic(Characteristic.On, this.sirenOn);
  }

  if (this.sirenHomeOn) {
    this.sirenHomeOn = false;
    this.sirenHomeService.setCharacteristic(Characteristic.On, this.sirenHomeOn);
  }

  if (this.sirenAwayOn) {
    this.sirenAwayOn = false;
    this.sirenAwayService.setCharacteristic(Characteristic.On, this.sirenAwayOn);
  }

  if (this.sirenNightOn) {
    this.sirenNightOn = false;
    this.sirenNightService.setCharacteristic(Characteristic.On, this.sirenNightOn);
  }

  // Clear timeout
  if (this.armingTimeout !== null) {
    clearTimeout(this.armingTimeout);
  }
};

SecuritySystem.prototype.updateTargetState = function(state, delay, server) {
  // Check if mode already set
  if (this.currentState === state) {
    return;
  }

  // Check if state enabled
  if (this.targetStates.includes(state) === false) {
    return;
  }

  this.targetState = state;
  this.logState('Target', state);

  if (server) {
    this.service
    .getCharacteristic(Characteristic.SecuritySystemTargetState)
    .updateValue(this.targetState);
  }

  this.handleStateChange();
  this.executeCommand('target', state);

  if (this.webhook) {
    this.sendWebhookEvent('target', state);
  }

  let armSeconds = 0;

  // Add arm delay if alarm is not triggered
  if (this.currentState !== Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    // Only if set to a mode excluding off
    if (state !== Characteristic.SecuritySystemCurrentState.DISARMED) {
      // Only if delay is enabled
      if (delay) {
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

SecuritySystem.prototype.getTargetState = function(callback) {
  callback(null, this.targetState);
};

SecuritySystem.prototype.setTargetState = function(state, callback) {
  this.updateTargetState(state, true, false);
  callback(null);
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
      callback('Security system not armed yet.');
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

      // Sensor already triggered
      if (this.triggerTimeout !== null) {
        return;
      }

      this.triggerTimeout = setTimeout(() => {
        // Reset
        this.triggerTimeout = null;
        this.modeChanged = false;

        // 🎵 And there goes the alarm... 🎵
        this.setCurrentState(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
      }, this.triggerSeconds * 1000);

      // Execute command
      this.executeCommand('current', 'alert');

      // Send Webhook request
      if (this.webhook) {
        this.sendWebhookEvent('current', 'alert');
      }
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

  if (callback !== null) {
    callback(null);
  }
};

SecuritySystem.prototype.isCodeSent = function(req) {
  let code = req.query.code;

  if (code === undefined) {
    // Check if auth is disabled
    if (isOptionSet(this.serverCode) === false) {
      return true;
    }

    return false;
  }

  return true;
};

SecuritySystem.prototype.isCodeValid = function(req) {
  // Check if auth is disabled
  if (isOptionSet(this.serverCode) === false) {
    return true;
  }

  // Check brute force
  if (this.invalidCodeAttempts > MAX_CODE_ATTEMPTS) {
    req.blocked = true;
    return false;
  }

  let userCode = req.query.code;
  userCode = parseInt(userCode);

  if (userCode !== this.serverCode) {
    this.invalidCodeAttempts++;
    return false;
  }

  // Reset
  this.invalidCodeAttempts = 0;

  return true;
};

SecuritySystem.prototype.getDelayParameter = function(req) {
  const delayParameter = req.query.delay;

  if (delayParameter === 'true') {
    return true;
  }
  else if (delayParameter === 'false') {
    return false;
  }

  return false;
};

SecuritySystem.prototype.sendCodeRequiredError = function(res) {
  this.log('Code required (Server)')

  const response = {
    'error': true,
    'message': MESSAGE_CODE_REQUIRED
  };

  res.status(401).json(response);
};

SecuritySystem.prototype.sendCodeInvalidError = function(req, res) {
  const response = {
    'error': true
  };

  if (req.blocked) {
    this.log('Code blocked (Server)');
    response.message = MESSAGE_CODE_BLOCKED;
  }
  else {
    this.log('Code invalid (Server)');
    response.message = MESSAGE_CODE_INVALID;
  }

  res.status(403).json(response);
};

SecuritySystem.prototype.sendModeDisabledError = function(res) {
  this.log('Mode disabled (Server)')

  const response = {
    'error': true,
    'message': MESSAGE_MODE_DISABLED
  };
  
  res.status(400).json(response);
};

SecuritySystem.prototype.sendOkResponse = function(res) {
  const response = {
    'error': false
  };

  res.json(response);
};

SecuritySystem.prototype.startServer = async function() {
  app.get('/status', (req, res) => {
    if (this.isCodeSent(req) === false) {
      this.sendCodeRequiredError(res);
      return;
    }

    if (this.isCodeValid(req) === false) {
      this.sendCodeInvalidError(req, res);
      return;
    }

    const response = {
      'current_mode': this.state2Mode(this.currentState),
      'target_mode': this.state2Mode(this.targetState),
      'arming': this.arming
    };

    res.json(response);
  });

  app.get('/triggered', (req, res) => {
    if (this.isCodeSent(req) === false) {
      this.sendCodeRequiredError(res);
      return;
    }

    if (this.isCodeValid(req) === false) {
      this.sendCodeInvalidError(req, res);
      return;
    }

    if (this.getDelayParameter(req)) {
      this.sensorTriggered(true, null);
    }
    else {
      this.setCurrentState(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
    }

    this.sendOkResponse(res);
  });

  app.get('/home', (req, res) => {
    if (this.isCodeSent(req) === false) {
      this.sendCodeRequiredError(res);
      return;
    }

    if (this.isCodeValid(req) === false) {
      this.sendCodeInvalidError(req, res);
      return;
    }

    const state = Characteristic.SecuritySystemTargetState.STAY_ARM;

    // Check if state enabled
    if (this.targetStates.includes(state) === false) {
      this.sendModeDisabledError(res);
      return;
    }

    this.updateTargetState(state, this.getDelayParameter(req), true);
    this.sendOkResponse(res);
  });

  app.get('/away', (req, res) => {
    if (this.isCodeSent(req) === false) {
      this.sendCodeRequiredError(res);
      return;
    }

    if (this.isCodeValid(req) === false) {
      this.sendCodeInvalidError(req, res);
      return;
    }

    const state = Characteristic.SecuritySystemTargetState.AWAY_ARM;

    // Check if state enabled
    if (this.targetStates.includes(state) === false) {
      this.sendModeDisabledError(res);
      return;
    }

    this.updateTargetState(state, this.getDelayParameter(req), true);
    this.sendOkResponse(res);
  });

  app.get('/night', (req, res) => {
    if (this.isCodeSent(req) === false) {
      this.sendCodeRequiredError(res);
      return;
    }

    if (this.isCodeValid(req) === false) {
      this.sendCodeInvalidError(req, res);
      return;
    }

    const state = Characteristic.SecuritySystemTargetState.NIGHT_ARM;

    // Check if state enabled
    if (this.targetStates.includes(state) === false) {
      this.sendModeDisabledError(res);
      return;
    }

    this.updateTargetState(state, this.getDelayParameter(req), true);
    this.sendOkResponse(res);
  });

  app.get('/off', (req, res) => {
    if (this.isCodeSent(req) === false) {
      this.sendCodeRequiredError(res);
      return;
    }

    if (this.isCodeValid(req) === false) {
      this.sendCodeInvalidError(req, res);
      return;
    }

    const state = Characteristic.SecuritySystemTargetState.DISARM;

    // Check if state enabled
    if (this.targetStates.includes(state) === false) {
      this.sendModeDisabledError(res);
      return;
    }

    this.updateTargetState(state, this.getDelayParameter(req), true);
    this.sendOkResponse(res);
  });

  // Listener
  const server = app.listen(this.serverPort, error => {
    if (error) {
      this.log('Error while starting server.');
      this.log(error);
      return;
    }
    
    this.log(`Server (${this.serverPort})`);
  });

  server.on('error', (error) => {
    this.log('Error while starting server.');
    this.log(error);
  });
};

SecuritySystem.prototype.executeCommand = function(type, state) {
  let command = null;

  switch (state) {
    case Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED:
      command = this.commandTriggered;
      break;

    case Characteristic.SecuritySystemCurrentState.STAY_ARM:
      if (type === 'current') {
        command = this.commandCurrentHome;
        break;
      }

      command = this.commandTargetHome;
      break;

    case Characteristic.SecuritySystemCurrentState.AWAY_ARM:
      if (type === 'current') {
        command = this.commandCurrentAway;
        break;
      }

      command = this.commandTargetAway;
      break;

    case Characteristic.SecuritySystemCurrentState.NIGHT_ARM:
      if (type === 'current') {
        command = this.commandCurrentNight;
        break;
      }

      command = this.commandTargetNight;
      break;

    case Characteristic.SecuritySystemCurrentState.DISARMED:
      if (type === 'target') {
        return;
      }

      command = this.commandOff;
      break;

    case 'alert':
      command = this.commandAlert;
      break;

    default:
      this.log(`Unknown state (${state})`);
  }

  if (command === undefined || command === null) {
    return;
  }

  exec(command, (error, stdout, stderr) => {
    if (error !== null) {
      this.log(`Command failed (${command})\n${error}`);
      return;
    }

    if (stderr !== '') {
      this.log(`Command failed (${command})\n${stderr}`);
      return;
    }

    this.log(`Command output: ${stdout}`);
  });
};

SecuritySystem.prototype.sendWebhookEvent = function(type, state) {
  let path = null;

  switch (state) {
    case Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED:
      path = this.webhookTriggered;
      break;

    case Characteristic.SecuritySystemCurrentState.STAY_ARM:
      if (type === 'current') {
        path = this.webhookCurrentHome;
        break;
      }

      path = this.webhookTargetHome;
      break;

    case Characteristic.SecuritySystemCurrentState.AWAY_ARM:
      if (type === 'current') {
        path = this.webhookCurrentAway;
        break;
      }

      path = this.webhookTargetAway;
      break;

    case Characteristic.SecuritySystemCurrentState.NIGHT_ARM:
      if (type === 'current') {
        path = this.webhookCurrentNight;
        break;
      }

      path = this.webhookTargetNight;
      break;

    case Characteristic.SecuritySystemCurrentState.DISARMED:
      if (type === 'target') {
        return;
      }

      path = this.webhookOff;
      break;

    case 'alert':
      path = this.webhookAlert;
      break;

    default:
      this.log(`Unknown state (${state})`);
      return;
  }

  if (path === undefined || path === null) {
    this.log('Missing webhook path for state.');
    return;
  }

  // Send GET request to server
  fetch(this.webhookUrl + path)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Status code (${response.statusCode})`);
      }

      this.log('Webhook event (Sent)');
    })
    .catch(error => {
      this.log(`Request to webhook failed. (${path})`);
      this.log(error);
    });
};

// Siren Switch
SecuritySystem.prototype.getSirenState = function(callback) {
  callback(null, this.sirenOn);
};

SecuritySystem.prototype.setSirenState = function(state, callback) {
  this.sirenOn = state;
  this.sensorTriggered(state, callback);
};

// Siren Mode Switches
SecuritySystem.prototype.triggerIfModeSet = function(switchRequiredState, state, callback) {
  if (state) {
    if (switchRequiredState === this.currentState) {
      this.sensorTriggered(state, null);
      callback(null);
    }
    else if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
      this.sensorTriggered(state, null);
    }
    else {
      callback('Security system not armed with required state.');
    }
  }
  else {
    this.sensorTriggered(state, null);
    callback(null);
  }
};

SecuritySystem.prototype.getSirenHomeState = function(callback) {
  callback(null, this.sirenHomeOn);
};

SecuritySystem.prototype.setSirenHomeState = function(state, callback) {
  this.sirenHomeOn = state;

  this.triggerIfModeSet(
    Characteristic.SecuritySystemCurrentState.STAY_ARM,
    state,
    callback
  );
};

SecuritySystem.prototype.getSirenAwayState = function(callback) {
  callback(null, this.sirenAwayOn);
};

SecuritySystem.prototype.setSirenAwayState = function(state, callback) {
  this.sirenAwayOn = state;

  this.triggerIfModeSet(
    Characteristic.SecuritySystemCurrentState.AWAY_ARM,
    state,
    callback
  );
};

SecuritySystem.prototype.getSirenNightState = function(callback) {
  callback(null, this.sirenNightOn);
};

SecuritySystem.prototype.setSirenNightState = function(state, callback) {
  this.sirenNightOn = state;

  this.triggerIfModeSet(
    Characteristic.SecuritySystemCurrentState.NIGHT_ARM,
    state,
    callback
  );
};

// Accessory
SecuritySystem.prototype.getServices = function() {
  return this.services;
};
