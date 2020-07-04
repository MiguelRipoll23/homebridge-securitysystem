const fs = require("fs");
const path = require('path');
const { exec, spawn } = require('child_process');
const packageJson = require('./package.json');

const customServices = require('./homekit/customServices');
const customCharacteristics = require('./homekit/customCharacteristics');
const serverConstants = require('./constants/server.js');

const fetch = require('node-fetch');
const storage = require('node-persist');
const express = require('express');

let Service, Characteristic, CustomService, CustomCharacteristic;
let homebridgeStoragePath, app;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  CustomCharacteristic = customCharacteristics.CustomCharacteristic(Characteristic);
  CustomService = customServices.CustomService(Service, Characteristic, CustomCharacteristic);

  homebridgeStoragePath = homebridge.user.storagePath();
  app = express();

  homebridge.registerAccessory('homebridge-securitysystem', 'security-system', SecuritySystem);
};

function isValueSet(value) {
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
  this.pauseMinutes = config.pause_minutes;
  this.resetMinutes = config.reset_minutes;
  this.sirenSwitch = config.siren_switch;
  this.modeSwitches = config.unsafe_mode_switches;
  this.hideModeOffSwitch = config.hide_mode_off_switch;
  this.showModePauseSwitch = config.show_mode_pause_switch;
  this.sirenModeSwitches = config.siren_mode_switches;
  this.sirenSensor = config.siren_sensor;
  this.sirenSensorSeconds = config.siren_sensor_seconds;
  this.overrideOff = config.override_off;
  this.audio = config.audio;
  this.audioLanguage = config.audio_language;
  this.audioAlertLooped = config.audio_alert_looped;
  this.saveState = config.save_state;

  // Optional: server
  this.serverPort = config.server_port;
  this.serverCode = config.server_code;

  // Optional: commands
  this.commandTargetHome = config.command_target_home;
  this.commandTargetAway = config.command_target_away;
  this.commandTargetNight = config.command_target_night;
  this.commandTargetOff = config.command_target_off;

  this.commandCurrentHome = config.command_current_home;
  this.commandCurrentAway = config.command_current_away;
  this.commandCurrentNight = config.command_current_night;
  this.commandCurrentOff = config.command_current_off || config.command_off;

  this.commandAlert = config.command_alert;
  this.commandTriggered = config.command_triggered;

  // Optional: webhook
  this.webhookUrl = config.webhook_url;

  this.webhookTargetHome = config.webhook_target_home;
  this.webhookTargetAway = config.webhook_target_away;
  this.webhookTargetNight = config.webhook_target_night;
  this.webhookTargetOff = config.webhook_target_off;

  this.webhookCurrentHome = config.webhook_current_home;
  this.webhookCurrentAway = config.webhook_current_away;
  this.webhookCurrentNight = config.webhook_current_night;
  this.webhookCurrentOff = config.webhook_current_off || config.webhook_off;

  this.webhookAlert = config.webhook_alert;
  this.webhookTriggered = config.webhook_triggered;

  // Deprecated warnings
  if (isValueSet(config.command_off)) {
    this.log.error('Option comand_off has been deprecated, use command_current_off instead.');
  }

  if (isValueSet(config.webhook_off)) {
    this.log.error('Option webhook_off has been deprecated, use webhook_current_off instead.');
  }

  // Variables
  this.defaultState = null;
  this.targetStates = null;
  this.originalState = null;
  this.stateChanged = false;
  this.audioProcess = null;

  this.invalidCodeAttempts = 0;
  this.webhook = false

  this.armingTimeout = null;
  this.pauseTimeout = null;
  this.triggerTimeout = null;
  this.sirenInterval = null;
  this.resetTimeout = null;

  // Check for optional options
  if (isValueSet(this.defaultMode)) {
    this.defaultMode = this.defaultMode.toLowerCase();
    this.defaultState = this.mode2State(this.defaultMode);
  }
  else {
    this.defaultState = Characteristic.SecuritySystemCurrentState.DISARMED;
  }

  if (isValueSet(this.disabledModes) === false) {
    this.disabledModes = [];
  }

  if (isValueSet(this.armSeconds) === false) {
    this.armSeconds = 0;
  }

  if (isValueSet(this.triggerSeconds) === false) {
    this.triggerSeconds = 0;
  }

  if (isValueSet(this.resetMinutes) === false) {
    this.resetMinutes = 10;
  }

  if (isValueSet(this.modeSwitches) === false) {
    this.modeSwitches = false;
  }

  if (isValueSet(this.hideModeOffSwitch) === false) {
    this.hideModeOffSwitch = false;
  }

  if (isValueSet(this.showModePauseSwitch) === false) {
    this.showModePauseSwitch = false;
  }

  if (isValueSet(this.pauseMinutes) === false) {
    this.pauseMinutes = 0;
  }

  if (isValueSet(this.sirenSwitch) === false) {
    this.sirenSwitch = true;
  }

  if (isValueSet(this.sirenSensor) === false) {
    this.sirenSensor = false;
  }

  if (isValueSet(this.sirenSensorSeconds) === false) {
    this.sirenSensorSeconds = 5;
  }

  if (isValueSet(this.sirenModeSwitches) === false) {
    this.sirenModeSwitches = false;
  }

  if (isValueSet(this.overrideOff) === false) {
    this.overrideOff = false;
  }

  if (isValueSet(this.audio) === false) {
    this.audio = false;
  }

  if (isValueSet(this.audioLanguage) === false) {
    this.audioLanguage = 'en-US';
  }

  if (isValueSet(this.audioAlertLooped) === false) {
    this.audioAlertLooped = false;
  }

  if (isValueSet(this.saveState) === false) {
    this.saveState = false;
  }

  if (isValueSet(this.serverPort)) {
    this.serverCode = config.server_code;

    if (this.serverPort < 0 || this.serverPort > 65535) {
      this.log('Server port is invalid.');
    }
    else {
      this.startServer();
    }
  }

  this.webhook = isValueSet(this.webhookUrl);

  // Log
  this.logMode('Default', this.defaultState);
  this.log(`Arm delay (${this.armSeconds} second/s)`);
  this.log(`Trigger delay (${this.triggerSeconds} second/s)`);

  if (this.audio) {
    this.log('Audio (Enabled)');
  }
  else {
    this.log('Audio (Disabled)');
  }

  if (this.webhook) {
    this.log(`Webhook (${this.webhookUrl})`);
  }

  // Security system
  this.service = new CustomService.SecuritySystem(this.name);
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
    .setProps({validValues: this.targetStates})
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
    .getCharacteristic(CustomCharacteristic.SecuritySystemSiren)
    .on('get', this.getSirenState1.bind(this))
    .on('set', this.setSirenState1.bind(this));

  this.service
    .getCharacteristic(CustomCharacteristic.SecuritySystemArmingDelay)
    .on('get', this.getArmingDelay.bind(this))
    .on('set', this.setArmingDelay.bind(this));

  // Siren switch (Optional)
  this.sirenSwitchService = new Service.Switch('Siren', 'siren-switch');

  this.sirenSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenState2.bind(this))
    .on('set', this.setSirenState2.bind(this));

  // Siren sensor (Optional)
  this.sirenSensorService = new Service.MotionSensor('Siren Triggered', 'siren-triggered');

  this.sirenSensorService
    .getCharacteristic(Characteristic.MotionDetected)
    .on('get', this.getSirenSensorState.bind(this));

  // Mode switches (Optional)
  this.modeHomeService = new Service.Switch('Mode Home', 'mode-home');

  this.modeHomeService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModeHomeState.bind(this))
    .on('set', this.setModeHomeState.bind(this));

  this.modeAwayService = new Service.Switch('Mode Away', 'mode-away');

  this.modeAwayService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModeAwayState.bind(this))
    .on('set', this.setModeAwayState.bind(this));

  this.modeNightService = new Service.Switch('Mode Night', 'mode-night');

  this.modeNightService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModeNightState.bind(this))
    .on('set', this.setModeNightState.bind(this));

  this.modeOffService = new Service.Switch('Mode Off', 'mode-off');

  this.modeOffService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModeOffState.bind(this))
    .on('set', this.setModeOffState.bind(this));

  this.modePauseService = new Service.Switch('Mode Pause', 'mode-pause');

  this.modePauseService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModePauseState.bind(this))
    .on('set', this.setModePauseState.bind(this));

  // Siren Mode Switches (Optional)
  this.sirenHomeService = new Service.Switch('Siren Home', 'siren-home');

  this.sirenHomeService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenHomeState.bind(this))
    .on('set', this.setSirenHomeState.bind(this));

  this.sirenAwayService = new Service.Switch('Siren Away', 'siren-away');

  this.sirenAwayService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenAwayState.bind(this))
    .on('set', this.setSirenAwayState.bind(this));

  this.sirenNightService = new Service.Switch('Siren Night', 'siren-night');

  this.sirenNightService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenNightState.bind(this))
    .on('set', this.setSirenNightState.bind(this));

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

  if (this.sirenSwitch) {
    this.services.push(this.sirenSwitchService);
  }

  if (this.sirenSensor) {
    this.services.push(this.sirenSensorService);
  }

  if (this.targetStates.includes(Characteristic.SecuritySystemTargetState.STAY_ARM)) {
    if (this.modeSwitches) {
      this.services.push(this.modeHomeService);
    }

    if (this.sirenModeSwitches) {
      this.services.push(this.sirenHomeService);
    }
  }

  if (this.targetStates.includes(Characteristic.SecuritySystemTargetState.AWAY_ARM)) {
    if (this.modeSwitches) {
      this.services.push(this.modeAwayService);
    }

    if (this.sirenModeSwitches) {
      this.services.push(this.sirenAwayService);
    }
  }

  if (this.targetStates.includes(Characteristic.SecuritySystemTargetState.NIGHT_ARM)) {
    if (this.modeSwitches) {
      this.services.push(this.modeNightService);
    }

    if (this.sirenModeSwitches) {
      this.services.push(this.sirenNightService);
    }
  }

  if (this.modeSwitches) {
    if (this.hideModeOffSwitch === false) {
      this.services.push(this.modeOffService);
    }
  }

  if (this.showModePauseSwitch) {
    this.services.push(this.modePauseService);
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

      this.log('Saved state (Found)');

      const currentState = isValueSet(state.currentState) ? state.currentState : this.defaultState;
      const targetState = isValueSet(state.targetState) ? state.targetState : this.defaultState;
      const armingDelay = isValueSet(state.armingDelay) ? state.armingDelay : true;

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
      this.log('Saved state (Error)');
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
    'armingDelay': this.armingDelay
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

    // Custom
    case 'alert':
      return state;

    default:
      this.log.error(`Unknown state (${state}).`);
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
      this.log.error(`Unknown mode (${mode}).`);
      return -1;
  }
};

SecuritySystem.prototype.logMode = function(type, state) {
  let mode = this.state2Mode(state);
  mode = mode.charAt(0).toUpperCase() + mode.slice(1);

  this.log(`${type} mode (${mode})`);
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

SecuritySystem.prototype.getArmingDelay = function(callback) {
  const value = this.service.getCharacteristic(CustomCharacteristic.SecuritySystemArmingDelay).value;
  callback(null, value);
};

SecuritySystem.prototype.setArmingDelay = function(value, callback) {
  this.armingDelay = value;
  this.log(`Arming delay (${(this.armingDelay) ? 'On' : 'Off'})`);

  // Save state to file
  if (this.saveState) {
    this.save();
  }

  callback(null);
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
  this.logMode('Current', state);

  // Commands
  this.executeCommand('current', state);

  // Webhooks
  if (this.webhook) {
    this.sendWebhookEvent('current', state);
  }

  // Audio
  if (this.audio) {
    this.playSound('current', state);
  }

  if (state === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    // Change motion sensor state to detected every x seconds
    // to allow multiple notifications
    this.sirenInterval = setInterval(() => {
      this.sirenSensorService.getCharacteristic(Characteristic.MotionDetected).updateValue(true);

      setTimeout(() => {
        this.sirenSensorService.getCharacteristic(Characteristic.MotionDetected).updateValue(false);
      }, 750);
    }, this.sirenSensorSeconds * 1000);

    // Automatically reset when being triggered after x minutes
    this.resetTimeout = setTimeout(() => {
      this.resetTimeout = null;
      this.log.debug('Reset timeout (Fired)');

      this.resetTimers();
      this.handleStateChange(true);

      this.setCurrentState(this.targetState);
    }, this.resetMinutes * 60 * 1000);
  }

  // Save state to file
  if (this.saveState) {
    this.save();
  }
};

SecuritySystem.prototype.resetTimers = function() {
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

SecuritySystem.prototype.handleStateChange = function(external) {
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

SecuritySystem.prototype.updateTargetState = function(state, external, delay) {
  // Check if state is already arming
  if (this.targetState === state && 
      this.currentState !== Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    return;
  }

  // Check if state is enabled
  if (this.targetStates.includes(state) === false) {
    return;
  }

  // Reset timers
  this.resetTimers();

  // Update target state
  this.targetState = state;
  this.logMode('Target', state);

  // Update characteristics & switches
  this.handleStateChange(external);

  // Commands
  this.executeCommand('target', state);

  // Webhooks
  if (this.webhook) {
    this.sendWebhookEvent('target', state);
  }

  // Check if state is currently
  // selected
  if (this.currentState === state) {
    if (this.audio) {
      this.playSound('current', this.currentState);
    }

    return;
  }

  // Audio
  if (this.audio && this.stateChanged === false && this.armSeconds > 0) {
    this.playSound('target', state);
  }

  if (delay === undefined) {
    delay = this.service.getCharacteristic(CustomCharacteristic.SecuritySystemArmingDelay).value;
  }

  let armSeconds = 0;

  // Add arm delay if alarm is not triggered
  if (this.currentState !== Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    // Only if set to a mode excluding off
    if (state !== Characteristic.SecuritySystemTargetState.DISARM) {
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

  // Arm the alarm after delay
  this.armingTimeout = setTimeout(() => {
    this.armingTimeout = null;
    this.setCurrentState(state);

    // Only if set to a mode excluding off
    if (state !== Characteristic.SecuritySystemTargetState.DISARM) {
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

SecuritySystem.prototype.setTargetState = function(value, callback) {
  this.resetModePauseSwitch();
  this.updateTargetState(value, false);

  callback(null);
};

SecuritySystem.prototype.sensorTriggered = function(value, callback) {
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
  if (this.arming) {
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
      this.log('Sensor/s (Triggered)');

      // Check if sensor already triggered
      if (this.triggerTimeout !== null) {
        return;
      }

      this.triggerTimeout = setTimeout(() => {
        // Reset
        this.triggerTimeout = null;
        this.stateChanged = false;

        // 🎵 And there goes the alarm... 🎵
        this.setCurrentState(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
      }, this.triggerSeconds * 1000);

      // Audio
      if (this.audio && this.triggerSeconds !== 0) {
        this.playSound('current', 'alert');
      }

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
    this.log('Sensor/s (Cancelled)');
    this.stopSound();

    if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
      if (this.stateChanged === false) {
        this.updateTargetState(Characteristic.SecuritySystemTargetState.DISARM, true, false);
      }
    }
    else {
      this.resetTimers();

      if (this.audio) {
        this.playSound('current', this.currentState);
      }
    }
  }

  if (callback !== null) {
    callback(null);
  }
};

SecuritySystem.prototype.getSirenState1 = function(callback) {
  const value = this.service.getCharacteristic(CustomCharacteristic.SecuritySystemSiren).value;
  callback(null, value);
};

SecuritySystem.prototype.setSirenState1 = function(value, callback) {
  this.sensorTriggered(value, callback);
};

// Server
SecuritySystem.prototype.isCodeSent = function(req) {
  let code = req.query.code;

  if (code === undefined) {
    // Check if auth is disabled
    if (isValueSet(this.serverCode) === false) {
      return true;
    }

    return false;
  }

  return true;
};

SecuritySystem.prototype.isCodeValid = function(req) {
  // Check if auth is disabled
  if (isValueSet(this.serverCode) === false) {
    return true;
  }

  // Check brute force
  if (this.invalidCodeAttempts > serverConstants.MAX_CODE_ATTEMPTS) {
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
    'message': serverConstants.MESSAGE_CODE_REQUIRED
  };

  res.status(401).json(response);
};

SecuritySystem.prototype.sendCodeInvalidError = function(req, res) {
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

SecuritySystem.prototype.sendModeDisabledError = function(res) {
  this.log('Mode disabled (Server)')

  const response = {
    'error': true,
    'message': serverConstants.MESSAGE_MODE_DISABLED
  };
  
  res.status(400).json(response);
};

SecuritySystem.prototype.sendModePausedError = function(res) {
  this.log('Mode paused (Server)')

  const response = {
    'error': true,
    'message': serverConstants.MESSAGE_MODE_PAUSED
  };
  
  res.status(400).json(response);
};

SecuritySystem.prototype.sendModeOffError = function(res) {
  this.log('Mode off (Server)')

  const response = {
    'error': true,
    'message': serverConstants.MESSAGE_MODE_OFF
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

    // Check if security system is disarmed
    if (this.currentState === Characteristic.SecuritySystemCurrentState.DISARMED) {
      if (this.overrideOff === false) {
        this.sendModeOffError(res);
        return;
      }
    }

    if (this.getDelayParameter(req)) {
      this.sensorTriggered(true, null);
    }
    else {
      this.resetModePauseSwitch();
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

    this.resetModePauseSwitch();
    this.updateTargetState(state, true, this.getDelayParameter(req));
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

    this.resetModePauseSwitch();
    this.updateTargetState(state, true, this.getDelayParameter(req));
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

    // Check if mode paused
    if (this.pauseTimeout !== null) {
      this.sendModePausedError(res);
      return;
    }

    this.updateTargetState(state, true, this.getDelayParameter(req));
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

    this.resetModePauseSwitch();
    this.updateTargetState(state, true, this.getDelayParameter(req));
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
    this.log.error('Error while starting server.');
    this.log.error(error);
  });
};

// Audio
SecuritySystem.prototype.playSound = async function(type, state) {
  const mode = this.state2Mode(state);

  // Ignore 'Current Off' event
  if (mode === 'off') {
    if (type === 'target') {
      return;
    }
  }

  // Close previous player
  this.stopSound();

  const filename = `${type}-${mode}.mp3`;
  const filePath = `${__dirname}/sounds/${this.audioLanguage}/${filename}`;

  // Check if file exists
  try {
    await fs.promises.access(filePath);
  }
  catch (error) {
    this.log.debug(`Sound file not found (${this.audioLanguage}/${filename})`);
    return;
  }

  const options = ['-loglevel', 'error', '-nodisp', `${filePath}`];

  if (mode === 'triggered') {
    options.push('-loop');
    options.push('-1');
  }
  else if (mode === 'alert' && this.audioAlertLooped) {
    options.push('-loop');
    options.push('-1');
  }
  else {
    options.push('-autoexit');
  }
 
  this.audioProcess = spawn('ffplay', options);
  
  this.audioProcess.stderr.on('data', (data) => {
    this.log.error(`Audio failed\n${data}`);
  });

  this.audioProcess.on('close', function() {
    this.audioProcess = null;
	});
};

// Command
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
      if (type === 'current') {
        command = this.commandCurrentOff;
        break;
      }

      command = this.commandTargetOff;
      break;

    case 'alert':
      command = this.commandAlert;
      break;

    default:
      this.log.error(`Unknown ${type} state (${state})`);
  }

  if (isValueSet(command) === false) {
    this.log.debug(`Command option for ${type} mode is not set.`);
    return;
  }

  // Parameters
  command = command.replace('${currentMode}', this.state2Mode(this.currentState));

  exec(command, (error, stdout, stderr) => {
    if (error !== null) {
      this.log.error(`Command failed (${command})\n${error}`);
      return;
    }

    if (stderr !== '') {
      this.log.error(`Command failed (${command})\n${stderr}`);
      return;
    }

    this.log(`Command output: ${stdout}`);
  });
};

// Webhooks
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
      if (type === 'current') {
        path = this.webhookCurrentOff;
        return;
      }

      path = this.webhookTargetOff;
      break;

    case 'alert':
      path = this.webhookAlert;
      break;

    default:
      this.log.error(`Unknown ${type} state (${state})`);
      return;
  }

  if (isValueSet(path) === false) {
    this.log.debug(`Webhook option for ${type} mode is not set.`);
    return;
  }

  // Parameters
  path = path.replace('${currentMode}', this.state2Mode(this.currentState));

  // Send GET request to server
  fetch(this.webhookUrl + path)
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

SecuritySystem.prototype.stopSound = function() {
  if (this.audioProcess !== null) {
    this.audioProcess.kill();
  }
};

// Siren Switch
SecuritySystem.prototype.getSirenState2 = function(callback) {
  const value = this.sirenSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setSirenState2 = function(value, callback) {
  this.sensorTriggered(value, callback);
};

// Siren Sensor
SecuritySystem.prototype.getSirenSensorState = function(callback) {
  const value = this.sirenSensorService.getCharacteristic(Characteristic.MotionDetected).value;
  callback(null, value);
};

// Siren Mode Switches
SecuritySystem.prototype.resetSirenSwitches = function() {
  const sirenHomeOnCharacteristic = this.sirenHomeService.getCharacteristic(Characteristic.On);
  const sirenAwayOnCharacteristic = this.sirenAwayService.getCharacteristic(Characteristic.On);
  const sirenNightOnCharacteristic = this.sirenNightService.getCharacteristic(Characteristic.On);

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

SecuritySystem.prototype.triggerIfModeSet = function(switchRequiredState, value, callback) {
  if (value) {
    if (switchRequiredState === this.currentState) {
      this.sensorTriggered(value, null);
      callback(null);
    }
    else if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
      this.sensorTriggered(value, null);
      callback('Security system is triggered.');
    }
    else {
      callback('Security system not armed with required state.');
    }
  }
  else {
    this.sensorTriggered(value, null);
    callback(null);
  }
};

SecuritySystem.prototype.getSirenHomeState = function(callback) {
  const value = this.sirenHomeService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setSirenHomeState = function(value, callback) {
  this.triggerIfModeSet(Characteristic.SecuritySystemCurrentState.STAY_ARM, value, callback);
};

SecuritySystem.prototype.getSirenAwayState = function(callback) {
  const value = this.sirenAwayService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setSirenAwayState = function(value, callback) {
  this.triggerIfModeSet(Characteristic.SecuritySystemCurrentState.AWAY_ARM, value, callback);
};

SecuritySystem.prototype.getSirenNightState = function(callback) {
  const value = this.sirenAwayService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setSirenNightState = function(value, callback) {
  this.triggerIfModeSet(Characteristic.SecuritySystemCurrentState.NIGHT_ARM, value, callback);
};

// Mode Switches
SecuritySystem.prototype.resetModeSwitches = function() {
  const modeHomeCharacteristicOn = this.modeHomeService.getCharacteristic(Characteristic.On);
  const modeAwayCharacteristicOn = this.modeAwayService.getCharacteristic(Characteristic.On);
  const modeNightCharacteristicOn = this.modeNightService.getCharacteristic(Characteristic.On);
  const modeOffCharacteristicOn = this.modeOffService.getCharacteristic(Characteristic.On);

  if (modeHomeCharacteristicOn.value) {
    this.modeHomeService
      .getCharacteristic(Characteristic.On)
      .updateValue(false);
  }

  if (modeAwayCharacteristicOn.value) {
    this.modeAwayService
      .getCharacteristic(Characteristic.On)
      .updateValue(false);
  }

  if (modeNightCharacteristicOn.value) {
    this.modeNightService
      .getCharacteristic(Characteristic.On)
      .updateValue(false);
  }

  if (modeOffCharacteristicOn.value) {
    this.modeOffService
      .getCharacteristic(Characteristic.On)
      .updateValue(false);
  }
}

SecuritySystem.prototype.updateModeSwitches = function() {
  switch (this.targetState) {
    case Characteristic.SecuritySystemTargetState.STAY_ARM:
      this.modeHomeService
        .getCharacteristic(Characteristic.On)
        .updateValue(true);
      break;

    case Characteristic.SecuritySystemTargetState.AWAY_ARM:
      this.modeAwayService
        .getCharacteristic(Characteristic.On)
        .updateValue(true);
      break;

    case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
      this.modeNightService
        .getCharacteristic(Characteristic.On)
        .updateValue(true);
      break;

    case Characteristic.SecuritySystemTargetState.DISARM:
      this.modeOffService
        .getCharacteristic(Characteristic.On)
        .updateValue(true);
      break;
  }
};

SecuritySystem.prototype.getModeHomeState = function(callback) {
  const value = this.modeHomeService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModeHomeState = function(value, callback) {
  this.resetModePauseSwitch();

  if (value) {
    this.resetModeSwitches();
    this.updateTargetState(Characteristic.SecuritySystemTargetState.STAY_ARM, true);
  }
  else {
    this.service.setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.DISARM);
  }

  callback(null);
};

SecuritySystem.prototype.getModeAwayState = function(callback) {
  const value = this.modeAwayService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModeAwayState = function(value, callback) {
  this.resetModePauseSwitch();

  if (value) {
    this.resetModeSwitches();
    this.updateTargetState(Characteristic.SecuritySystemTargetState.AWAY_ARM, true);
  }
  else {
    this.service.setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.DISARM);
  }

  callback(null);
};

SecuritySystem.prototype.getModeNightState = function(callback) {
  const value = this.modeNightService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModeNightState = function(value, callback) {
  this.resetModePauseSwitch();

  if (value) {
    this.resetModeSwitches();
    this.updateTargetState(Characteristic.SecuritySystemTargetState.NIGHT_ARM, true);
  }
  else {
    this.service.setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.DISARM);
  }

  callback(null);
};

SecuritySystem.prototype.getModeOffState = function(callback) {
  const value = this.modeOffService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModeOffState = function(value, callback) {
  this.resetModePauseSwitch();

  if (value) {
    this.resetModeSwitches();
    this.updateTargetState(Characteristic.SecuritySystemTargetState.DISARM, true);
  }
  else {
    callback('Security system mode is already disarmed.');
    return;
  }

  callback(null);
};

SecuritySystem.prototype.resetModePauseSwitch = function() {
  if (this.pauseTimeout !== null) {
    clearTimeout(this.pauseTimeout);
    this.pauseTimeout = null;
  }

  const modePauseCharacteristicOn = this.modePauseService.getCharacteristic(Characteristic.On);

  if (modePauseCharacteristicOn.value) {
    this.modePauseService.getCharacteristic(Characteristic.On).updateValue(false);
  }
};

SecuritySystem.prototype.getModePauseState = function(callback) {
  const value = this.modePauseService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModePauseState = function(value, callback) {
  if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    callback('Security system is triggered.');
    return;
  }

  if (value) {
    if (this.currentState === Characteristic.SecuritySystemCurrentState.DISARMED) {
      callback('Security system is not armed.');
      return;
    }

    this.log('Pause (Started)');

    this.originalState = this.currentState;
    this.updateTargetState(Characteristic.SecuritySystemTargetState.DISARM, true, true);

    this.pauseTimeout = setTimeout(() => {
      this.log('Pause (Finished)');

      this.resetModePauseSwitch();
      this.updateTargetState(this.originalState, true, true);
    }, this.pauseMinutes * 60 * 1000);
  }
  else {
    this.log('Pause (Cancelled)');

    if (this.pauseTimeout !== null) {
      clearTimeout(this.pauseTimeout);
      this.pauseTimeout = null;
    }

    this.updateTargetState(this.originalState, true, true);
  }

  callback(null);
};

// Accessory
SecuritySystem.prototype.getServices = function() {
  return this.services;
};
