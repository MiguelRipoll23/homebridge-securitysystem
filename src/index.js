const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const packageJson = require('../package.json');
const options = require('./utils/options.js');
const customServices = require('./hap/customServices.js');
const customCharacteristics = require('./hap/customCharacteristics.js');
const serverConstants = require('./constants/server.js');

const fetch = require('node-fetch');
const storage = require('node-persist');
const express = require('express');

const app = express();

let Service, Characteristic, CustomService, CustomCharacteristic;
let homebridgeStoragePath;

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  CustomCharacteristic = customCharacteristics.CustomCharacteristic(Characteristic);
  CustomService = customServices.CustomService(Service, Characteristic, CustomCharacteristic);

  homebridgeStoragePath = homebridge.user.storagePath();

  homebridge.registerAccessory('homebridge-securitysystem', 'security-system', SecuritySystem);
};

function SecuritySystem(log, config) {
  this.log = log;
  options.init(log, config);

  this.defaultState = this.mode2State(options.defaultMode);
  this.targetStates = null;
  this.originalState = null;
  this.stateChanged = false;

  this.invalidCodeAttempts = 0;
  this.audioProcess = null;

  this.armingTimeout = null;
  this.pauseTimeout = null;
  this.triggerTimeout = null;
  this.sirenInterval = null;
  this.resetTimeout = null;

  // Log
  if (options.testMode) {
    this.log.warn('Test Mode');
  }

  this.logMode('Default', this.defaultState);
  this.log(`Arm delay (${options.armSeconds} second/s)`);
  this.log(`Trigger delay (${options.triggerSeconds} second/s)`);

  if (options.audio) {
    this.log('Audio (Enabled)');
  }
  else {
    this.log('Audio (Disabled)');
  }

  if (options.proxyMode) {
    this.log('Proxy mode (Enabled)');
  }

  if (options.isValueSet(options.webhookUrl)) {
    this.log(`Webhook (${options.webhookUrl})`);
  }

  // Security system
  this.service = new CustomService.SecuritySystem(options.name);
  this.targetStates = this.getEnabledStates();

  this.currentState = this.defaultState;
  this.targetState = this.defaultState;
  this.armingDelay = true;
  this.arming = false;

  this.service
    .getCharacteristic(Characteristic.SecuritySystemTargetState)
    .value = this.targetState;

  this.service
    .getCharacteristic(Characteristic.SecuritySystemTargetState)
    .setProps({ validValues: this.targetStates })
    .on('get', this.getTargetState.bind(this))
    .on('set', this.setTargetState.bind(this));

  this.service
    .getCharacteristic(Characteristic.SecuritySystemCurrentState)
    .value = this.currentState;

  this.service
    .getCharacteristic(Characteristic.SecuritySystemCurrentState)
    .on('get', this.getCurrentState.bind(this));

  this.service
    .getCharacteristic(CustomCharacteristic.SecuritySystemArming)
    .on('get', this.getTargetState.bind(this));

  this.service
    .getCharacteristic(CustomCharacteristic.SecuritySystemArmingDelay)
    .on('get', this.getArmingDelay.bind(this))
    .on('set', this.setArmingDelay.bind(this));

  this.service
    .getCharacteristic(CustomCharacteristic.SecuritySystemSiren)
    .on('get', this.getSiren.bind(this))
    .on('set', this.setSiren.bind(this));

  this.service
    .getCharacteristic(CustomCharacteristic.SecuritySystemReset)
    .on('get', this.getReset.bind(this))
    .on('set', this.setReset.bind(this));

  // Siren switch (Optional)
  this.sirenSwitchService = new Service.Switch('Siren', 'siren-switch');

  this.sirenSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenSwitchOn.bind(this))
    .on('set', this.setSirenSwitchOn.bind(this));

  // Siren sensor (Optional)
  this.sirenMotionSensorService = new Service.MotionSensor('Siren Triggered', 'siren-triggered');

  this.sirenMotionSensorService
    .getCharacteristic(Characteristic.MotionDetected)
    .on('get', this.getSirenMotionDetected.bind(this));

  // Reset sensor (Optional)
  this.resetMotionSensorService = new Service.MotionSensor('Reset Event', 'reset-event');

  this.resetMotionSensorService
    .getCharacteristic(Characteristic.MotionDetected)
    .on('get', this.getResetMotionDetected.bind(this));

  // Mode switches (Optional)
  this.modeHomeSwitchService = new Service.Switch('Mode Home', 'mode-home');

  this.modeHomeSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModeHomeSwitchOn.bind(this))
    .on('set', this.setModeHomeSwitchOn.bind(this));

  this.modeAwaySwitchService = new Service.Switch('Mode Away', 'mode-away');

  this.modeAwaySwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModeAwaySwitchOn.bind(this))
    .on('set', this.setModeAwaySwitchOn.bind(this));

  this.modeNightSwitchService = new Service.Switch('Mode Night', 'mode-night');

  this.modeNightSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModeNightState.bind(this))
    .on('set', this.setModeNightState.bind(this));

  this.modeOffSwitchService = new Service.Switch('Mode Off', 'mode-off');

  this.modeOffSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModeOffSwitchOn.bind(this))
    .on('set', this.setModeOffSwitchOn.bind(this));

  this.modePauseSwitchService = new Service.Switch('Mode Pause', 'mode-pause');

  this.modePauseSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModePauseSwitchOn.bind(this))
    .on('set', this.setModePauseSwitchOn.bind(this));

  // Siren Mode Switches (Optional)
  this.sirenHomeSwitchService = new Service.Switch('Siren Home', 'siren-home');

  this.sirenHomeSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenHomeSwitchOn.bind(this))
    .on('set', this.setSirenHomeSwitchOn.bind(this));

  this.sirenAwaySwitchService = new Service.Switch('Siren Away', 'siren-away');

  this.sirenAwaySwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenAwaySwitchOn.bind(this))
    .on('set', this.setSirenAwaySwitchOn.bind(this));

  this.sirenNightSwitchService = new Service.Switch('Siren Night', 'siren-night');

  this.sirenNightSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenNightSwitchOn.bind(this))
    .on('set', this.setSirenNightSwitchOn.bind(this));

  // Accessory information
  this.accessoryInformationService = new Service.AccessoryInformation();

  this.accessoryInformationService.setCharacteristic(Characteristic.Identify, true);
  this.accessoryInformationService.setCharacteristic(Characteristic.Manufacturer, 'MiguelRipoll23');
  this.accessoryInformationService.setCharacteristic(Characteristic.Model, 'DIY');
  this.accessoryInformationService.setCharacteristic(Characteristic.Name, 'homebridge-securitysystem');
  this.accessoryInformationService.setCharacteristic(Characteristic.SerialNumber, 'S3CUR1TYSYST3M');
  this.accessoryInformationService.setCharacteristic(Characteristic.FirmwareRevision, packageJson.version);

  // Services list
  this.services = [
    this.service,
    this.accessoryInformationService
  ];

  if (options.sirenSensor) {
    this.services.push(this.sirenMotionSensorService);
  }

  if (options.sirenSwitch) {
    this.services.push(this.sirenSwitchService);
  }

  if (options.resetSensor) {
    this.services.push(this.resetMotionSensorService);
  }

  if (this.targetStates.includes(Characteristic.SecuritySystemTargetState.STAY_ARM)) {
    if (options.modeSwitches) {
      this.services.push(this.modeHomeSwitchService);
    }

    if (options.sirenModeSwitches) {
      this.services.push(this.sirenHomeSwitchService);
    }
  }

  if (this.targetStates.includes(Characteristic.SecuritySystemTargetState.AWAY_ARM)) {
    if (options.modeSwitches) {
      this.services.push(this.modeAwaySwitchService);
    }

    if (options.sirenModeSwitches) {
      this.services.push(this.sirenAwaySwitchService);
    }
  }

  if (this.targetStates.includes(Characteristic.SecuritySystemTargetState.NIGHT_ARM)) {
    if (options.modeSwitches) {
      this.services.push(this.modeNightSwitchService);
    }

    if (options.sirenModeSwitches) {
      this.services.push(this.sirenNightSwitchService);
    }
  }

  if (options.modeSwitches) {
    if (options.modeOffSwitch) {
      this.services.push(this.modeOffSwitchService);
    }
  }

  if (options.modePauseSwitch) {
    this.services.push(this.modePauseSwitchService);
  }

  // Audio
  this.setupAudio();

  // Storage
  if (options.saveState) {
    this.load();
  }

  // Server
  this.startServer();
}

SecuritySystem.prototype.load = async function () {
  const storageOptions = {
    'dir': path.join(homebridgeStoragePath, 'homebridge-securitysystem')
  };

  await storage.init(storageOptions)
    .then()
    .catch((error) => {
      this.log.error('Unable to load state.');
      this.log.error(error);
    });

  if (options.testMode) {
    await storage.clear();
    this.log.debug('Saved data from the plugin cleared.');

    return;
  }

  await storage.getItem('state')
    .then(state => {
      if (state === undefined) {
        return;
      }

      this.log.debug('State (Loaded)', state);

      // Data
      this.log('Saved state (Found)');

      const currentState = options.isValueSet(state.currentState) ? state.currentState : this.defaultState;
      const targetState = options.isValueSet(state.targetState) ? state.targetState : this.defaultState;
      const armingDelay = options.isValueSet(state.armingDelay) ? state.armingDelay : true;

      // Change target state if triggered
      if (currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
        this.targetState = targetState;
      }
      else {
        this.targetState = currentState;
      }

      this.currentState = currentState;
      this.armingDelay = armingDelay;

      // Update characteristics values
      const targetStateCharacteristic = this.service.getCharacteristic(Characteristic.SecuritySystemTargetState);
      targetStateCharacteristic.updateValue(this.targetState);

      const currentStateCharacteristic = this.service.getCharacteristic(Characteristic.SecuritySystemCurrentState);
      currentStateCharacteristic.updateValue(this.currentState);

      const armingDelayCharacteristic = this.service.getCharacteristic(CustomCharacteristic.SecuritySystemArmingDelay);
      armingDelayCharacteristic.updateValue(this.armingDelay);

      this.updateModeSwitches();

      // Log
      this.logMode('Current', this.currentState);
      this.log(`Arming delay (${this.armingDelay === true ? 'On' : 'Off'})`);
    })
    .catch(error => {
      this.log.error('Saved state (Error)');
      this.log.error(error);
    });
};

SecuritySystem.prototype.save = async function () {
  // Check option
  if (options.saveState === false) {
    return;
  }

  if (storage.defaultInstance === undefined) {
    this.log.error('Unable to save state.');
    return;
  }

  const state = {
    'currentState': this.currentState,
    'targetState': this.targetState,
    'armingDelay': this.armingDelay
  };

  await storage.setItem('state', state)
    .then(() => {
      this.log.debug('State (Saved)', state);
    })
    .catch(error => {
      this.log.error('Unable to save state.');
      this.log.error(error);
    });
};

SecuritySystem.prototype.identify = function (callback) {
  this.log('Identify');
  callback(null);
};

// Security system
SecuritySystem.prototype.state2Mode = function (state) {
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

    // Custom
    case 'warning':
      return state;

    default:
      this.log.error(`Unknown state (${state}).`);
      return 'unknown';
  }
};

SecuritySystem.prototype.mode2State = function (mode) {
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
      this.log.error(`Unknown mode (${mode}).`);
      return -1;
  }
};

SecuritySystem.prototype.logMode = function (type, state) {
  let mode = this.state2Mode(state);
  mode = mode.charAt(0).toUpperCase() + mode.slice(1);

  this.log(`${type} mode (${mode})`);
};

SecuritySystem.prototype.getEnabledStates = function () {
  const targetStateCharacteristic = this.service.getCharacteristic(Characteristic.SecuritySystemTargetState);
  const targetStates = targetStateCharacteristic.props.validValues;

  const disabledStates = [];

  for (let disabledMode of options.disabledModes) {
    const state = this.mode2State(disabledMode.toLowerCase());
    disabledStates.push(state);
  }

  return targetStates.filter(mode => !disabledStates.includes(mode));
};

SecuritySystem.prototype.getCurrentState = function (callback) {
  callback(null, this.currentState);
};

SecuritySystem.prototype.setCurrentState = function (state, external) {
  // Check if mode already set
  if (this.currentState === state) {
    return;
  }

  this.currentState = state;
  this.service.setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
  this.logMode('Current', state);

  // Audio
  this.playAudio('current', state);

  // Commands
  this.executeCommand('current', state, external);

  // Webhooks
  this.sendWebhookEvent('current', state, external);

  if (state === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    // Change motion sensor state to detected every x seconds
    // to allow multiple notifications
    this.sirenInterval = setInterval(() => {
      this.sirenMotionSensorService.getCharacteristic(Characteristic.MotionDetected).updateValue(true);

      setTimeout(() => {
        this.sirenMotionSensorService.getCharacteristic(Characteristic.MotionDetected).updateValue(false);
      }, 750);
    }, options.sirenSensorSeconds * 1000);

    // Automatically arm the security system
    // when time runs out
    this.resetTimeout = setTimeout(() => {
      this.resetTimeout = null;
      this.log.debug('Reset timeout (Fired)');

      this.resetTimers();
      this.handleStateChange(true);

      // Reset characteristic & sensor
      this.service
        .getCharacteristic(CustomCharacteristic.SecuritySystemReset)
        .updateValue(true);

      this.resetMotionSensorService
        .getCharacteristic(Characteristic.MotionDetected)
        .updateValue(true);

      setTimeout(() => {
        this.service
          .getCharacteristic(CustomCharacteristic.SecuritySystemReset)
          .updateValue(false);

        this.resetMotionSensorService
          .getCharacteristic(Characteristic.MotionDetected)
          .updateValue(false);
      }, 750);

      // Alternative flow (Triggered -> Off -> Armed mode)
      if (options.resetOffFlow) {
        const originalTargetState = this.targetState;
        this.updateTargetState(Characteristic.SecuritySystemTargetState.DISARM, true, false, null);

        setTimeout(() => {
          this.updateTargetState(originalTargetState, true, true, null);
        }, 100);

        return;
      }

      this.setCurrentState(this.targetState, false);
    }, options.resetMinutes * 60 * 1000);
  }

  this.save();
};

SecuritySystem.prototype.resetTimers = function () {
  // Clear trigger timeout
  if (this.triggerTimeout !== null) {
    clearTimeout(this.triggerTimeout);

    this.triggerTimeout = null;
    this.log.debug('Trigger timeout (Cleared)');
  }

  // Clear arming timeout
  if (this.armingTimeout !== null) {
    clearTimeout(this.armingTimeout);

    this.armingTimeout = null;
    this.log.debug('Arming timeout (Cleared)');
  }

  // Stop siren triggered sensor
  if (this.sirenInterval !== null) {
    clearInterval(this.sirenInterval);

    this.sirenInterval = null;
    this.log.debug('Siren interval (Cleared)');
  }

  // Clear security system reset timeout
  if (this.resetTimeout !== null) {
    clearTimeout(this.resetTimeout);

    this.resetTimeout = null;
    this.log.debug('Reset timeout (Cleared)');
  }
};

SecuritySystem.prototype.handleStateChange = function (external) {
  // Set security system to mode
  // selected from the user
  // during triggered state
  this.stateChanged = this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;

  // Update characteristics
  if (external) {
    this.service.getCharacteristic(Characteristic.SecuritySystemTargetState).updateValue(this.targetState);
  }

  const sirenCharacteristic = this.service.getCharacteristic(CustomCharacteristic.SecuritySystemSiren);
  const sirenOnCharacteristic = this.sirenSwitchService.getCharacteristic(Characteristic.On);

  if (sirenCharacteristic.value) {
    sirenCharacteristic.updateValue(false);
  }

  if (sirenOnCharacteristic.value) {
    sirenOnCharacteristic.updateValue(false);
  }

  // Update switches
  this.resetSirenSwitches();
  this.resetModeSwitches();
  this.updateModeSwitches();
};

SecuritySystem.prototype.updateTargetState = function (state, external, delay, callback) {
  // Check if state is already arming
  if (this.targetState === state &&
    this.currentState !== Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    this.log.warn('Target mode (Already set)');

    if (callback !== null) {
      callback(null);
    }

    return 1;
  }

  // Check if state is enabled
  if (this.targetStates.includes(state) === false) {
    this.log.warn('Target mode (Disabled)');

    if (callback !== null) {
      // Tip: this will revert the original state
      callback(Characteristic.SecuritySystemTargetState.DISARM);
    }

    return 2;
  }

  // Reset timers
  this.resetTimers();

  // Update target state
  this.targetState = state;
  this.logMode('Target', state);

  // Update characteristics & switches
  this.handleStateChange(external);

  // Canceled mode change
  // Play current sound
  if (this.currentState === state) {
    this.playAudio('current', this.currentState);
  }

  // Commands
  this.executeCommand('target', state, external);

  // Webhooks
  this.sendWebhookEvent('target', state, external);

  // Check if state is already set
  if (this.currentState === state) {
    this.log.warn('Current mode (Already set)');

    if (this.arming) {
      this.updateArming(false);
    }

    if (callback !== null) {
      callback(null);
    }

    return 4;
  }

  // Check arming delay
  if (delay === null) {
    delay = this.service.getCharacteristic(CustomCharacteristic.SecuritySystemArmingDelay).value;
  }

  // Audio
  if (this.stateChanged === false && delay && options.armSeconds > 0) {
    this.playAudio('target', state);
  }

  let armSeconds = 0;

  // Add arm delay if alarm is not triggered
  if (this.currentState !== Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    // Only if set to a mode excluding off
    if (state !== Characteristic.SecuritySystemTargetState.DISARM) {
      // Only if delay is enabled
      if (delay) {
        armSeconds = options.armSeconds;

        // Update arming value
        this.updateArming(true);
      }
    }
  }

  // Arm the security system
  this.armingTimeout = setTimeout(() => {
    this.armingTimeout = null;
    this.setCurrentState(state, external);

    // Only if set to a mode excluding off
    if (state !== Characteristic.SecuritySystemTargetState.DISARM) {
      this.updateArming(false);
    }
  }, armSeconds * 1000);

  if (callback !== null) {
    callback(null);
  }

  return 0;
};

SecuritySystem.prototype.getTargetState = function (callback) {
  callback(null, this.targetState);
};

SecuritySystem.prototype.setTargetState = function (value, callback) {
  this.resetModePauseSwitch();
  this.updateTargetState(value, false, null, callback);
};

SecuritySystem.prototype.getArming = function (callback) {
  callback(null, this.arming);
};

SecuritySystem.prototype.updateArming = function (value) {
  this.arming = value;
  this.service
    .getCharacteristic(CustomCharacteristic.SecuritySystemArming)
    .updateValue(this.arming);
};

SecuritySystem.prototype.getArmingDelay = function (callback) {
  const value = this.service.getCharacteristic(CustomCharacteristic.SecuritySystemArmingDelay).value;
  callback(null, value);
};

SecuritySystem.prototype.setArmingDelay = function (value, callback) {
  this.armingDelay = value;
  this.log(`Arming delay (${(this.armingDelay) ? 'On' : 'Off'})`);

  callback(null);
  this.save();
};

SecuritySystem.prototype.getSiren = function (callback) {
  const value = this.service.getCharacteristic(CustomCharacteristic.SecuritySystemSiren).value;
  callback(null, value);
};

SecuritySystem.prototype.updateSiren = function (value, external, callback) {
  // Ignore if the security system
  // mode is off
  if (this.currentState === Characteristic.SecuritySystemCurrentState.DISARMED) {
    if (options.overrideOff === false) {
      this.log.warn('Sensor (Not armed)');

      if (callback !== null) {
        callback('Security system not armed.');
      }

      return;
    }
  }

  // Ignore if the security system
  // is arming
  if (this.arming) {
    this.log.warn('Sensor (Still arming)');

    if (callback !== null) {
      callback('Security system not armed yet.');
    }

    return;
  }

  if (value) {
    // On
    if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
      if (callback !== null) {
        callback('Security system already triggered.');
      }

      return;
    }
    else {
      this.log('Sensor (Triggered)');

      // Check if sensor already triggered
      if (this.triggerTimeout !== null) {
        return;
      }

      this.triggerTimeout = setTimeout(() => {
        // Reset
        this.triggerTimeout = null;
        this.stateChanged = false;

        // 🎵 And there goes the alarm... 🎵
        this.setCurrentState(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED, external);
      }, options.triggerSeconds * 1000);

      // Audio
      if (options.triggerSeconds !== 0) {
        this.playAudio('current', 'warning');
      }

      // Commands
      this.executeCommand('current', 'warning', external);

      // Webhooks
      this.sendWebhookEvent('current', 'warning', external);
    }
  }
  else {
    // Off
    this.log('Sensor (Cancelled)');
    this.stopAudio();

    if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
      if (this.stateChanged === false) {
        this.updateTargetState(Characteristic.SecuritySystemTargetState.DISARM, true, false, null);
      }
    }
    else {
      this.resetTimers();
      this.playAudio('current', this.currentState);
    }
  }

  if (callback !== null) {
    callback(null);
  }
};

SecuritySystem.prototype.setSiren = function (value, callback) {
  this.updateSiren(value, false, callback);
};

SecuritySystem.prototype.getReset = function (callback) {
  const value = this.service.getCharacteristic(CustomCharacteristic.SecuritySystemReset).value;
  callback(null, value);
};

SecuritySystem.prototype.setReset = function (callback) {
  const value = this.service.getCharacteristic(CustomCharacteristic.SecuritySystemReset).value;
  callback(null, value);
};

// Server
SecuritySystem.prototype.isCodeSent = function (req) {
  let code = req.query.code;

  if (code === undefined) {
    // Check if auth is disabled
    if (options.serverCode === null) {
      return true;
    }

    return false;
  }

  return true;
};

SecuritySystem.prototype.isCodeValid = function (req) {
  // Check if auth is disabled
  if (options.serverCode === null) {
    return true;
  }

  // Check brute force
  if (this.invalidCodeAttempts > serverConstants.MAX_CODE_ATTEMPTS) {
    req.blocked = true;
    return false;
  }

  let userCode = req.query.code;
  userCode = parseInt(userCode);

  if (userCode !== options.serverCode) {
    this.invalidCodeAttempts++;
    return false;
  }

  // Reset
  this.invalidCodeAttempts = 0;

  return true;
};

SecuritySystem.prototype.getDelayParameter = function (req) {
  const delayParameter = req.query.delay;

  if (delayParameter === 'true') {
    return true;
  }
  else if (delayParameter === 'false') {
    return false;
  }

  return false;
};

SecuritySystem.prototype.sendCodeRequiredError = function (res) {
  this.log('Code required (Server)')

  const response = {
    'error': true,
    'message': serverConstants.MESSAGE_CODE_REQUIRED
  };

  res.status(401).json(response);
};

SecuritySystem.prototype.sendCodeInvalidError = function (req, res) {
  const response = {
    'error': true
  };

  if (req.blocked) {
    this.log('Code blocked (Server)');
    response.message = serverConstants.MESSAGE_CODE_BLOCKED;
  }
  else {
    this.log('Code invalid (Server)');
    response.message = serverConstants.MESSAGE_CODE_INVALID;
  }

  res.status(403).json(response);
};

SecuritySystem.prototype.sendResponse = function (res, result) {
  const response = {
    'error': result > 0
  };

  res.json(response);
};

SecuritySystem.prototype.startServer = async function () {
  // Check option
  if (options.isValueSet(options.serverPort) === false) {
    return;
  }

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
      'sensor_triggered': (
        this.triggerTimeout !== null
        ||
        this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED
      ),
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

    // Check if security system is disarmed
    if (this.currentState === Characteristic.SecuritySystemCurrentState.DISARMED) {
      if (options.overrideOff === false) {
        this.sendModeOffError(res);
        return;
      }
    }

    // Check delay and trigger
    if (this.getDelayParameter(req)) {
      this.updateSiren(true, true, null);
    }
    else {
      this.resetModePauseSwitch();
      this.setCurrentState(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED, true);
    }

    this.sendResponse(res);
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
    const delay = this.getDelayParameter(req);

    const result = this.updateTargetState(state, true, delay, null);

    this.resetModePauseSwitch();
    this.sendResponse(res, result);
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
    const delay = this.getDelayParameter(req);

    const result = this.updateTargetState(state, true, delay, null);

    this.resetModePauseSwitch();
    this.sendResponse(res, result);
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
    const delay = this.getDelayParameter(req);

    const result = this.updateTargetState(state, true, delay, null);

    this.sendResponse(res, result);
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
    const delay = this.getDelayParameter(req);

    const result = this.updateTargetState(state, true, delay, null);

    this.resetModePauseSwitch();
    this.sendResponse(res, result);
  });

  // Listener
  const server = app.listen(options.serverPort, error => {
    if (error) {
      this.log.error('Error while starting server.');
      this.log.error(error);
      return;
    }

    this.log(`Server (${options.serverPort})`);
  });

  server.on('error', (error) => {
    this.log.error('Error while starting server.');
    this.log.error(error);
  });
};

// Audio
SecuritySystem.prototype.playAudio = async function (type, state) {
  // Check option
  if (options.audio === false) {
    return;
  }

  const mode = this.state2Mode(state);

  // Ignore 'Current Off' event
  if (mode === 'off') {
    if (type === 'target') {
      return;
    }
  }

  // Close previous player
  this.stopAudio();

  // Directory
  let directory = `${__dirname}/../sounds`;

  if (options.isValueSet(options.audioPath)) {
    directory = options.audioPath;

    if (directory[directory.length] === '/') {
      directory = directory.substring(0, directory.length - 1);
    }
  }

  // Check if file exists
  const filename = `${type}-${mode}.mp3`;
  const filePath = `${directory}/${options.audioLanguage}/${filename}`;

  try {
    await fs.promises.access(filePath);
  }
  catch (error) {
    this.log.debug(`Sound file not found (${options.audioLanguage}/${filename})`);
    this.log.error(filePath);
    return;
  }

  // Arguments
  let commandArguments = ['-loglevel', 'error', '-nodisp', '-i', `${filePath}`];
 
  if (mode === 'triggered') {
    commandArguments.push('-loop');
    commandArguments.push('-1');
  }
  else if (mode === 'warning' && options.audioAlertLooped) {
    commandArguments.push('-loop');
    commandArguments.push('-1');
  }
  else {
    commandArguments.push('-autoexit');

    if (options.isValueSet(options.audioVolume)) {
      commandArguments.push('-volume');
      commandArguments.push(options.audioVolume);
    }
  }

  // Process
  this.audioProcess = spawn('ffplay', commandArguments);
  this.log.debug(`ffplay ${commandArguments.join(' ')}`);

  this.audioProcess.stderr.on('data', (data) => {
    this.log.error(`Audio failed\n${data}`);
  });

  this.audioProcess.on('close', function () {
    this.audioProcess = null;
  });
};

SecuritySystem.prototype.stopAudio = function () {
  if (this.audioProcess !== null) {
    this.audioProcess.kill();
  }
};

SecuritySystem.prototype.setupAudio = async function () {
  if (options.isValueSet(options.audioPath) === false) {
    return;
  }

  try {
    await fs.promises.access(`${options.audioPath}/${options.audioLanguage}`);
  }
  catch (error) {
    await fs.promises.mkdir(`${options.audioPath}/${options.audioLanguage}`);

    await fs.promises.copyFile(`${__dirname}/sounds/README`, `${options.audioPath}/README`);
    await fs.promises.copyFile(`${__dirname}/sounds/README`, `${options.audioPath}/README.txt`);

    this.log.warn('Check audio path directory for instructions.');
  }
};

// Command
SecuritySystem.prototype.executeCommand = function (type, state, external) {
  // Check proxy mode
  if (options.proxyMode && external) {
    this.log.debug('Command bypassed as proxy mode is enabled.');
    return;
  }

  let command = null;

  switch (state) {
    case Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED:
      command = options.commandCurrentTriggered;
      break;

    case Characteristic.SecuritySystemCurrentState.STAY_ARM:
      if (type === 'current') {
        command = options.commandCurrentHome;
        break;
      }

      command = options.commandTargetHome;
      break;

    case Characteristic.SecuritySystemCurrentState.AWAY_ARM:
      if (type === 'current') {
        command = options.commandCurrentAway;
        break;
      }

      command = options.commandTargetAway;
      break;

    case Characteristic.SecuritySystemCurrentState.NIGHT_ARM:
      if (type === 'current') {
        command = options.commandCurrentNight;
        break;
      }

      command = options.commandTargetNight;
      break;

    case Characteristic.SecuritySystemCurrentState.DISARMED:
      if (type === 'current') {
        command = options.commandCurrentOff;
        break;
      }

      command = options.commandTargetOff;
      break;

    case 'warning':
      command = options.commandCurrentWarning;
      break;

    default:
      this.log.error(`Unknown ${type} state (${state})`);
  }

  if (command === undefined || command === null) {
    this.log.debug(`Command option for ${type} mode is not set.`);
    return;
  }

  // Parameters
  command = command.replace('${currentMode}', this.state2Mode(this.currentState));

  const process = spawn(command, { shell: true });

  process.stderr.on('data', (data) => {
    this.log.error(`Command failed (${command})\n${data}`);
  });

  process.stdout.on('data', (data) => {
    this.log(`Command output: ${data}`);
  });
};

// Webhooks
SecuritySystem.prototype.sendWebhookEvent = function (type, state, external) {
  // Check option
  if (options.isValueSet(options.webhookUrl) === false) {
    this.log.debug('Webhook base URL option is not set.');
    return;
  }

  // Check proxy mode
  if (options.proxyMode && external) {
    this.log.debug('Webhook bypassed as proxy mode is enabled.');
    return;
  }

  let path = null;

  switch (state) {
    case Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED:
      path = options.webhookCurrentTriggered;
      break;

    case Characteristic.SecuritySystemCurrentState.STAY_ARM:
      if (type === 'current') {
        path = options.webhookCurrentHome;
        break;
      }

      path = options.webhookTargetHome;
      break;

    case Characteristic.SecuritySystemCurrentState.AWAY_ARM:
      if (type === 'current') {
        path = options.webhookCurrentAway;
        break;
      }

      path = options.webhookTargetAway;
      break;

    case Characteristic.SecuritySystemCurrentState.NIGHT_ARM:
      if (type === 'current') {
        path = options.webhookCurrentNight;
        break;
      }

      path = options.webhookTargetNight;
      break;

    case Characteristic.SecuritySystemCurrentState.DISARMED:
      if (type === 'current') {
        path = options.webhookCurrentOff;
        break;
      }

      path = options.webhookTargetOff;
      break;

    case 'warning':
      path = options.webhookCurrentWarning;
      break;

    default:
      this.log.error(`Unknown ${type} state (${state})`);
      return;
  }

  if (path === undefined || path === null) {
    this.log.debug(`Webhook option for ${type} mode is not set.`);
    return;
  }

  // Parameters
  path = path.replace('${currentMode}', this.state2Mode(this.currentState));

  // Send GET request to server
  fetch(options.webhookUrl + path)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Status code (${response.status})`);
      }

      this.log('Webhook event (Sent)');
    })
    .catch(error => {
      this.log.error(`Request to webhook failed. (${path})`);
      this.log.error(error);
    });
};

// Siren Motion Sensor
SecuritySystem.prototype.getSirenMotionDetected = function (callback) {
  const value = this.sirenMotionSensorService.getCharacteristic(Characteristic.MotionDetected).value;
  callback(null, value);
};

// Siren Switch
SecuritySystem.prototype.getSirenSwitchOn = function (callback) {
  const value = this.sirenSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setSirenSwitchOn = function (value, callback) {
  this.updateSiren(value, false, callback);
};

// Siren Mode Switches
SecuritySystem.prototype.resetSirenSwitches = function () {
  const sirenHomeOnCharacteristic = this.sirenHomeSwitchService.getCharacteristic(Characteristic.On);
  const sirenAwayOnCharacteristic = this.sirenAwaySwitchService.getCharacteristic(Characteristic.On);
  const sirenNightOnCharacteristic = this.sirenNightSwitchService.getCharacteristic(Characteristic.On);

  if (sirenHomeOnCharacteristic.value) {
    sirenHomeOnCharacteristic.updateValue(false);
  }

  if (sirenAwayOnCharacteristic.value) {
    sirenAwayOnCharacteristic.updateValue(false);
  }

  if (sirenNightOnCharacteristic.value) {
    sirenNightOnCharacteristic.updateValue(false);
  }
};

SecuritySystem.prototype.triggerIfModeSet = function (switchRequiredState, value, callback) {
  if (value) {
    if (switchRequiredState === this.currentState) {
      this.updateSiren(value, false, null);
      callback(null);
    }
    else if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
      this.updateSiren(value, false, null);

      this.log.warn('Sensor (Already triggered)');
      callback('Security system is triggered.');
    }
    else {
      this.log.warn('Sensor (Invalid mode)');
      callback('Security system not armed with required state.');
    }
  }
  else {
    this.updateSiren(value, false, null);
    callback(null);
  }
};

SecuritySystem.prototype.getSirenHomeSwitchOn = function (callback) {
  const value = this.sirenHomeSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setSirenHomeSwitchOn = function (value, callback) {
  this.triggerIfModeSet(Characteristic.SecuritySystemCurrentState.STAY_ARM, value, callback);
};

SecuritySystem.prototype.getSirenAwaySwitchOn = function (callback) {
  const value = this.sirenAwaySwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setSirenAwaySwitchOn = function (value, callback) {
  this.triggerIfModeSet(Characteristic.SecuritySystemCurrentState.AWAY_ARM, value, callback);
};

SecuritySystem.prototype.getSirenNightSwitchOn = function (callback) {
  const value = this.sirenNightSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setSirenNightSwitchOn = function (value, callback) {
  this.triggerIfModeSet(Characteristic.SecuritySystemCurrentState.NIGHT_ARM, value, callback);
};

// Reset Motion Sensor
SecuritySystem.prototype.getResetMotionDetected = function (callback) {
  const value = this.resetMotionSensorService.getCharacteristic(Characteristic.MotionDetected).value;
  callback(null, value);
};

// Mode Switches
SecuritySystem.prototype.resetModeSwitches = function () {
  const modeHomeCharacteristicOn = this.modeHomeSwitchService.getCharacteristic(Characteristic.On);
  const modeAwayCharacteristicOn = this.modeAwaySwitchService.getCharacteristic(Characteristic.On);
  const modeNightCharacteristicOn = this.modeNightSwitchService.getCharacteristic(Characteristic.On);
  const modeOffCharacteristicOn = this.modeOffSwitchService.getCharacteristic(Characteristic.On);

  if (modeHomeCharacteristicOn.value) {
    this.modeHomeSwitchService
      .getCharacteristic(Characteristic.On)
      .updateValue(false);
  }

  if (modeAwayCharacteristicOn.value) {
    this.modeAwaySwitchService
      .getCharacteristic(Characteristic.On)
      .updateValue(false);
  }

  if (modeNightCharacteristicOn.value) {
    this.modeNightSwitchService
      .getCharacteristic(Characteristic.On)
      .updateValue(false);
  }

  if (modeOffCharacteristicOn.value) {
    this.modeOffSwitchService
      .getCharacteristic(Characteristic.On)
      .updateValue(false);
  }
}

SecuritySystem.prototype.updateModeSwitches = function () {
  switch (this.targetState) {
    case Characteristic.SecuritySystemTargetState.STAY_ARM:
      this.modeHomeSwitchService
        .getCharacteristic(Characteristic.On)
        .updateValue(true);
      break;

    case Characteristic.SecuritySystemTargetState.AWAY_ARM:
      this.modeAwaySwitchService
        .getCharacteristic(Characteristic.On)
        .updateValue(true);
      break;

    case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
      this.modeNightSwitchService
        .getCharacteristic(Characteristic.On)
        .updateValue(true);
      break;

    case Characteristic.SecuritySystemTargetState.DISARM:
      this.modeOffSwitchService
        .getCharacteristic(Characteristic.On)
        .updateValue(true);
      break;
  }
};

SecuritySystem.prototype.getModeHomeSwitchOn = function (callback) {
  const value = this.modeHomeSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModeHomeSwitchOn = function (value, callback) {
  if (value === false) {
    callback('Action not allowed.');
    return;
  }

  this.resetModePauseSwitch();
  this.resetModeSwitches();

  this.updateTargetState(Characteristic.SecuritySystemTargetState.STAY_ARM, true, null, null);
  callback(null);
};

SecuritySystem.prototype.getModeAwaySwitchOn = function (callback) {
  const value = this.modeAwaySwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModeAwaySwitchOn = function (value, callback) {
  if (value === false) {
    callback('Action not allowed.');
    return;
  }

  this.resetModePauseSwitch();
  this.resetModeSwitches();

  this.updateTargetState(Characteristic.SecuritySystemTargetState.AWAY_ARM, true, null, null);
  callback(null);
};

SecuritySystem.prototype.getModeNightState = function (callback) {
  const value = this.modeNightSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModeNightState = function (value, callback) {
  if (value === false) {
    callback('Action not allowed.');
    return;
  }

  this.resetModePauseSwitch();
  this.resetModeSwitches();

  this.updateTargetState(Characteristic.SecuritySystemTargetState.NIGHT_ARM, true, null, null);
  callback(null);
};

SecuritySystem.prototype.getModeOffSwitchOn = function (callback) {
  const value = this.modeOffSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModeOffSwitchOn = function (value, callback) {
  if (value === false) {
    callback('Action not allowed.');
    return;
  }

  this.resetModePauseSwitch();
  this.resetModeSwitches();

  this.updateTargetState(Characteristic.SecuritySystemTargetState.DISARM, true, null, null);
  callback(null);
};

SecuritySystem.prototype.resetModePauseSwitch = function () {
  if (this.pauseTimeout !== null) {
    clearTimeout(this.pauseTimeout);
    this.pauseTimeout = null;
  }

  const modePauseCharacteristicOn = this.modePauseSwitchService.getCharacteristic(Characteristic.On);

  if (modePauseCharacteristicOn.value) {
    this.modePauseSwitchService.getCharacteristic(Characteristic.On).updateValue(false);
  }
};

SecuritySystem.prototype.getModePauseSwitchOn = function (callback) {
  const value = this.modePauseSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModePauseSwitchOn = function (value, callback) {
  if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    this.log.warn('Mode switch (Triggered)');
    callback('Security system is triggered.');
    return;
  }

  if (value) {
    if (this.currentState === Characteristic.SecuritySystemCurrentState.DISARMED) {
      this.log.warn('Mode switch (Not armed)');
      callback('Security system is not armed.');
      return;
    }

    this.log('Pause (Started)');

    this.originalState = this.currentState;
    this.updateTargetState(Characteristic.SecuritySystemTargetState.DISARM, true, true, null);

    // Check if time is set to unlimited
    if (options.pauseMinutes !== 0) {
      this.pauseTimeout = setTimeout(() => {
        this.log('Pause (Finished)');
  
        this.resetModePauseSwitch();
        this.updateTargetState(this.originalState, true, true, null);
      }, options.pauseMinutes * 60 * 1000);
    }
  }
  else {
    this.log('Pause (Cancelled)');

    if (this.pauseTimeout !== null) {
      clearTimeout(this.pauseTimeout);
      this.pauseTimeout = null;
    }

    this.updateTargetState(this.originalState, true, true, null);
  }

  callback(null);
};

// Accessory
SecuritySystem.prototype.getServices = function () {
  return this.services;
};
