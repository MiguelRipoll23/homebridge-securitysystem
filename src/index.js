const fs = require('fs');
const path = require('path');
const storage = require('node-persist');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const express = require('express');

const packageJson = require('../package.json');
const options = require('./utils/options.js');
const customServices = require('./hap/customServices.js');
const customCharacteristics = require('./hap/customCharacteristics.js');

const app = express();

let Service, Characteristic, CustomService, CustomCharacteristic, storagePath;

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  CustomCharacteristic = customCharacteristics.CustomCharacteristic(Characteristic);
  CustomService = customServices.CustomService(Service, Characteristic, CustomCharacteristic);

  storagePath = homebridge.user.storagePath();

  homebridge.registerAccessory('homebridge-securitysystem', 'security-system', SecuritySystem);
};

function SecuritySystem(log, config) {
  this.log = log;
  options.init(log, config);

  this.defaultState = this.mode2State(options.defaultMode);
  this.currentState = this.defaultState;
  this.targetState = this.defaultState;
  this.availableTargetStates = null;

  this.isArming = false;
  this.isKnocked = false;

  this.invalidCodeCount = 0;
  
  this.pausedCurrentState = null;
  this.audioProcess = null;

  this.armTimeout = null;
  this.pauseTimeout = null;
  this.triggerTimeout = null;
  this.doubleKnockTimeout = null;
  this.resetTimeout = null;
  
  this.sirenInterval = null;
  
  // File logger
  if (options.isValueSet(options.logDirectory)) {
    const logInfo = this.log.info.bind(this.log);
    const logWarn = this.log.warn.bind(this.log);
    const logError = this.log.error.bind(this.log);

    this.log.info = (message) => {
      logInfo.apply(null, [message]);
      this.log.appendFile(message);
    };

    this.log.warn = (message) => {
      logWarn.apply(null, [message]);
      this.log.appendFile(message);
    };

    this.log.error = (message) => {
      logError.apply(null, [message]);
      this.log.appendFile(message);
    };

    this.log.appendFile = async (message) => {
      const date = new Date();

      try {
        const stats = await fs.promises.stat(`${options.logDirectory}/securitysystem.log`);

        if (stats.birthtime.toLocaleDateString() !== date.toLocaleDateString()) {
          await fs.promises.rename(
            `${options.logDirectory}/securitysystem.log`,
            `${options.logDirectory}/securitysystem-${stats.birthtime.toLocaleDateString().replaceAll('/', '-')}.log`
          );
        }
      }
      catch (error) {
        this.log.debug('Previous log file not found.');
      }

      try {
        await fs.promises.appendFile(
          `${options.logDirectory}/securitysystem.log`,
          `[${new Date().toLocaleString()}] ${message}\n`,
          { flag: 'a' }
        );
      }
      catch (error) {
        logError('File logger (Error)');
        logError(error);
      };
    }
  }

  // Log
  if (options.testMode) {
    this.log.warn('Test Mode');
  }

  this.logMode('Default', this.defaultState);
  this.log.info(`Arm delay (${options.armSeconds} second/s)`);
  this.log.info(`Trigger delay (${options.triggerSeconds} second/s)`);
  this.log.info(`Audio (${(options.audio) ? 'Enabled' : 'Disabled'})`);

  if (options.proxyMode) {
    this.log.info('Proxy mode (Enabled)');
  }

  if (options.isValueSet(options.webhookUrl)) {
    this.log.info(`Webhook (${options.webhookUrl})`);
  }

  // Security system
  this.service = new CustomService.SecuritySystem(options.name);
  this.availableTargetStates = this.getAvailableTargetStates();

  this.service
    .getCharacteristic(Characteristic.SecuritySystemTargetState)
    .value = this.targetState;

  this.service
    .getCharacteristic(Characteristic.SecuritySystemTargetState)
    .setProps({ validValues: this.availableTargetStates })
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
    .on('get', this.getSiren.bind(this))
    .on('set', this.setSiren.bind(this));

  // Siren switch
  this.sirenSwitchService = new Service.Switch('Siren', 'siren-switch');

  this.sirenSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenSwitch.bind(this))
    .on('set', this.setSirenSwitch.bind(this));

  // Siren sensor
  this.sirenMotionSensorService = new Service.MotionSensor('Siren Triggered', 'siren-triggered');

  this.sirenMotionSensorService
    .getCharacteristic(Characteristic.MotionDetected)
    .on('get', this.getSirenMotionDetected.bind(this));

  // Reset sensor
  this.resetMotionSensorService = new Service.MotionSensor('Reset Event', 'reset-event');

  this.resetMotionSensorService
    .getCharacteristic(Characteristic.MotionDetected)
    .on('get', this.getResetMotionDetected.bind(this));

  // Arming Lock
  this.armingLockSwitchService = new Service.Switch('Arming Lock', 'arming-lock');

  this.armingLockSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getArmingLockSwitch.bind(this))
    .on('set', this.setArmingLockSwitch.bind(this));

  // Mode switches
  this.modeHomeSwitchService = new Service.Switch('Mode Home', 'mode-home');

  this.modeHomeSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModeHomeSwitch.bind(this))
    .on('set', this.setModeHomeSwitch.bind(this));

  this.modeAwaySwitchService = new Service.Switch('Mode Away', 'mode-away');

  this.modeAwaySwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModeAwaySwitch.bind(this))
    .on('set', this.setModeAwaySwitch.bind(this));

  this.modeNightSwitchService = new Service.Switch('Mode Night', 'mode-night');

  this.modeNightSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModeNightSwitch.bind(this))
    .on('set', this.setModeNightSwitch.bind(this));

  this.modeOffSwitchService = new Service.Switch('Mode Off', 'mode-off');

  this.modeOffSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModeOffSwitch.bind(this))
    .on('set', this.setModeOffSwitch.bind(this));

  this.modeAwayExtendedSwitchService = new Service.Switch('Mode Away Extended', 'mode-away-extended');

  this.modeAwayExtendedSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModeAwayExtendedSwitch.bind(this))
    .on('set', this.setModeAwayExtendedSwitch.bind(this));

  this.modePauseSwitchService = new Service.Switch('Mode Pause', 'mode-pause');

  this.modePauseSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getModePauseSwitch.bind(this))
    .on('set', this.setModePauseSwitch.bind(this));

  // Siren mode switches
  this.sirenHomeSwitchService = new Service.Switch('Siren Home', 'siren-home');

  this.sirenHomeSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenHomeSwitch.bind(this))
    .on('set', this.setSirenHomeSwitch.bind(this));

  this.sirenAwaySwitchService = new Service.Switch('Siren Away', 'siren-away');

  this.sirenAwaySwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenAwaySwitch.bind(this))
    .on('set', this.setSirenAwaySwitch.bind(this));

  this.sirenNightSwitchService = new Service.Switch('Siren Night', 'siren-night');

  this.sirenNightSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSirenNightSwitch.bind(this))
    .on('set', this.setSirenNightSwitch.bind(this));

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

  if (options.resetSensor) {
    this.services.push(this.resetMotionSensorService);
  }

  if (options.armingLockSwitch) {
    this.services.push(this.armingLockSwitchService);
  }

  if (options.sirenSwitch) {
    this.services.push(this.sirenSwitchService);
  }

  if (this.availableTargetStates.includes(Characteristic.SecuritySystemTargetState.STAY_ARM)) {
    if (options.modeSwitches) {
      this.services.push(this.modeHomeSwitchService);
    }

    if (options.sirenModeSwitches) {
      this.services.push(this.sirenHomeSwitchService);
    }
  }

  if (this.availableTargetStates.includes(Characteristic.SecuritySystemTargetState.AWAY_ARM)) {
    if (options.modeSwitches) {
      this.services.push(this.modeAwaySwitchService);
    }

    if (options.sirenModeSwitches) {
      this.services.push(this.sirenAwaySwitchService);
    }
  }

  if (this.availableTargetStates.includes(Characteristic.SecuritySystemTargetState.NIGHT_ARM)) {
    if (options.modeSwitches) {
      this.services.push(this.modeNightSwitchService);
    }

    if (options.sirenModeSwitches) {
      this.services.push(this.sirenNightSwitchService);
    }
  }

  if (options.modeSwitches && options.modeOffSwitch) {
    this.services.push(this.modeOffSwitchService);
  }

  if (options.modeAwayExtendedSwitch) {
    this.services.push(this.modeAwayExtendedSwitchService);
  }

  if (options.modePauseSwitch) {
    this.services.push(this.modePauseSwitchService);
  }

  // Storage
  if (options.saveState) {
    this.load();
  }

  // Audio
  if (options.isValueSet(options.audioPath)) {
    this.setupAudio();
  }

  // Server
  if (options.isValueSet(options.serverPort)) {
    this.startServer();
  }
}

SecuritySystem.prototype.getServices = function () {
  return this.services;
};

SecuritySystem.prototype.load = async function () {
  const storageOptions = {
    'dir': path.join(storagePath, 'homebridge-securitysystem')
  };

  await storage.init(storageOptions)
    .then()
    .catch(error => {
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
      this.log.info('Saved state (Found)');

      const currentState = options.isValueSet(state.currentState) ? state.currentState : this.defaultState;
      const targetState = options.isValueSet(state.targetState) ? state.targetState : this.defaultState;

      // Change target state if triggered
      if (currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
        this.targetState = targetState;
      }
      else {
        this.targetState = currentState;
      }

      this.currentState = currentState;

      // Update characteristics values
      this.service.updateCharacteristic(Characteristic.SecuritySystemTargetState, this.targetState);
      this.service.updateCharacteristic(Characteristic.SecuritySystemCurrentState, this.currentState);
      this.handleStateUpdate(false);

      // Log
      this.logMode('Current', this.currentState);
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
    'targetState': this.targetState
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
  this.log.info('Identify');
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
    case 'lock':
      return state;

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

  this.log.info(`${type} mode (${mode})`);
};

SecuritySystem.prototype.getAvailableTargetStates = function () {
  const targetStateCharacteristic = this.service.getCharacteristic(Characteristic.SecuritySystemTargetState);
  const validValues = targetStateCharacteristic.props.validValues;
  const invalidValues = options.disabledModes.map((value) => {
    return this.mode2State(value.toLowerCase());
  });

  return validValues.filter(state => invalidValues.includes(state) === false);
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
      this.sirenMotionSensorService.updateCharacteristic(Characteristic.MotionDetected, true);

      setTimeout(() => {
        this.sirenMotionSensorService.updateCharacteristic(Characteristic.MotionDetected, false);
      }, 750);
    }, options.sirenSensorSeconds * 1000);

    // Automatically arm the security system
    // when time runs out
    this.resetTimeout = setTimeout(() => {
      this.resetTimeout = null;
      this.log.info('Reset (Finished)');

      // Update reset sensor
      this.resetMotionSensorService.updateCharacteristic(Characteristic.MotionDetected, true);

      setTimeout(() => {
        this.resetMotionSensorService.updateCharacteristic(Characteristic.MotionDetected, false);
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

      // Normal flow
      this.handleStateUpdate(false);
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
  if (this.armTimeout !== null) {
    clearTimeout(this.armTimeout);

    this.armTimeout = null;
    this.log.debug('Arming timeout (Cleared)');
  }

  // Clear siren triggered sensor
  if (this.sirenInterval !== null) {
    clearInterval(this.sirenInterval);

    this.sirenInterval = null;
    this.log.debug('Siren interval (Cleared)');
  }

  // Clear double-knock timeout
  if (this.doubleKnockTimeout !== null) {
    clearTimeout(this.doubleKnockTimeout);
    this.doubleKnockTimeout = null;

    this.log.debug('Double-knock timeout (Cleared)');
  }

  // Clear pause timeout
  if (this.pauseTimeout !== null) {
    clearTimeout(this.pauseTimeout);
    this.pauseTimeout = null;

    this.log.debug('Pause timeout (Cleared)');
  }

  // Clear security system reset timeout
  if (this.resetTimeout !== null) {
    clearTimeout(this.resetTimeout);

    this.resetTimeout = null;
    this.log.debug('Reset timeout (Cleared)');
  }
};

SecuritySystem.prototype.handleStateUpdate = function (alarmTriggered) {
  // Reset double-knock
  this.isKnocked = false;

  this.resetTimers();
  this.resetModeSwitches();
  this.updateModeSwitches();

  // Keep characteristic & switches on
  if (alarmTriggered) {
    return;
  }

  const sirenCharacteristic = this.service.getCharacteristic(CustomCharacteristic.SecuritySystemSiren);

  if (sirenCharacteristic.value) {
    sirenCharacteristic.updateValue(false);
  }

  const sirenOnCharacteristic = this.sirenSwitchService.getCharacteristic(Characteristic.On);

  if (sirenOnCharacteristic.value) {
    this.updateSiren(false, true, true, null);
  }

  this.resetSirenSwitches();
};

SecuritySystem.prototype.updateTargetState = function (state, external, delay, callback) {
  const isCurrentStateAlarmTriggered = this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;

  // Check if target state is already set
  if (state === this.targetState && isCurrentStateAlarmTriggered === false) {
    this.log.warn('Target mode (Already set)');

    if (callback !== null) {
      callback(null);
    }

    return false;
  }

  // Check if state is enabled
  if (this.availableTargetStates.includes(state) === false) {
    this.log.warn('Target mode (Disabled)');

    if (callback !== null) {
      // Tip: this will revert the original state
      callback(Characteristic.SecuritySystemTargetState.DISARM);
    }

    return false;
  }

  // Check arming lock
  const armingLockOnCharacteristic = this.armingLockSwitchService.getCharacteristic(Characteristic.On);
  const armingLockOnValue = armingLockOnCharacteristic.value;

  if (armingLockOnValue) {
    this.log.warn('Arming lock (Blocked)');

    if (callback !== null) {
      // Tip: this will revert the original state
      callback(Characteristic.SecuritySystemTargetState.DISARM);
    }

    return false;
  }

  // Update target state
  this.targetState = state;
  this.logMode('Target', state);

  const isTargetStateDisarm = this.targetState === Characteristic.SecuritySystemTargetState.DISARM;

  // Update characteristic
  if (external) {
    this.service.updateCharacteristic(Characteristic.SecuritySystemTargetState, this.targetState);
  }

  // Reset everything
  this.handleStateUpdate(false);

  // Commands
  this.executeCommand('target', state, external);

  // Webhooks
  this.sendWebhookEvent('target', state, external);

  // Check if current state is already set
  if (state === this.currentState) {
    this.log.warn('Current mode (Already set)');

    if (this.isArming) {
      this.updateArming(false);
    }

    this.playAudio('current', this.currentState);

    if (callback !== null) {
      callback(null);
    }

    return false;
  }

  // Play sound
  if (delay && options.armSeconds > 0 && isCurrentStateAlarmTriggered === false) {
    this.playAudio('target', state);
  }

  // Set arming delay (if neccessary)
  let armSeconds = 0;

  if (delay && isCurrentStateAlarmTriggered === false && isTargetStateDisarm === false) {
    armSeconds = options.armSeconds;

    // Update arming characteristic
    this.updateArming(true);
  }

  // Arm the security system
  this.armTimeout = setTimeout(() => {
    this.armTimeout = null;
    this.setCurrentState(state, external);

    // Only if set to a mode excluding off
    if (isTargetStateDisarm === false) {
      this.updateArming(false);
    }
  }, armSeconds * 1000);

  if (callback !== null) {
    callback(null);
  }

  return true;
};

SecuritySystem.prototype.getTargetState = function (callback) {
  callback(null, this.targetState);
};

SecuritySystem.prototype.setTargetState = function (value, callback) {
  this.updateTargetState(value, false, true, callback);
};

SecuritySystem.prototype.getArming = function (callback) {
  callback(null, this.isArming);
};

SecuritySystem.prototype.updateArming = function (value) {
  this.isArming = value;
  this.service.updateCharacteristic(CustomCharacteristic.SecuritySystemArming, this.isArming);
};

SecuritySystem.prototype.getSiren = function (callback) {
  const value = this.service.getCharacteristic(CustomCharacteristic.SecuritySystemSiren).value;
  callback(null, value);
};

SecuritySystem.prototype.updateSiren = function (value, external, stateChanged, callback) {
  const isCurrentStateAlarmTriggered = this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;
  const isCurrentStateAwayArm = this.currentState === Characteristic.SecuritySystemCurrentState.AWAY_ARM;

  // Check if the security system is disarmed
  if (this.currentState === Characteristic.SecuritySystemCurrentState.DISARMED && options.overrideOff === false) {
    this.log.warn('Sensor (Not armed)');

    if (callback !== null) {
      callback('Ignore');
    }

    return false;
  }

  // Check if arming
  if (this.isArming) {
    this.log.warn('Sensor (Still arming)');

    if (callback !== null) {
      callback('Ignore');
    }

    return false;
  }

  // Check double knock
  if (value && isCurrentStateAwayArm && options.doubleKnock) {
    if (this.isKnocked === false) {
      this.log.warn('Sensor (Knock)');
      this.isKnocked = true;
  
      this.doubleKnockTimeout = setTimeout(() => {
        this.doubleKnockTimeout = null;
        this.isKnocked = false;
  
        this.log.info('Sensor (Reset)');
      }, options.doubleKnockSeconds * 1000);
  
      if (callback !== null) {
        callback('Ignore');
      }
  
      return false;
    }
  }

  // Clear double-knock timeout
  if (this.doubleKnockTimeout !== null) {
    clearTimeout(this.doubleKnockTimeout);
    this.doubleKnockTimeout = null;

    this.log.debug('Double-knock timeout (Cleared)');
  }

  if (external) {
    this.sirenSwitchService.updateCharacteristic(Characteristic.On, value);
  }

  if (value) {
    // On
    if (isCurrentStateAlarmTriggered) {
      this.log.warn('Sensor (Already triggered)');
      
      if (callback !== null) {
        callback('Ignore');
      }

      return false;
    }
    else {
      this.log.info('Sensor (Triggered)');

      // Check if sensor already triggered
      if (this.triggerTimeout !== null) {
        return false;
      }

      const isCurrentStateNight = this.currentState === Characteristic.SecuritySystemCurrentState.NIGHT_ARM;
      
      // Set trigger delay (if neccessary)
      let triggerSeconds = options.triggerSeconds;

      if (isCurrentStateNight && options.nightTriggerDelay === false) {
        triggerSeconds = 0;
      }

      this.triggerTimeout = setTimeout(() => {
        this.triggerTimeout = null;
        this.setCurrentState(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED, external);
      }, triggerSeconds * 1000);

      // Audio
      if (triggerSeconds > 0) {
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
    this.log.info('Sensor (Cancelled)');
    this.stopAudio();

    if (isCurrentStateAlarmTriggered) {
      if (stateChanged === false) {
        this.updateTargetState(Characteristic.SecuritySystemTargetState.DISARM, true, false, null);
      }
    }
    else {
      this.resetTimers();
    }
  }

  if (callback !== null) {
    callback(null);
  }

  return true;
};

SecuritySystem.prototype.setSiren = function (value, callback) {
  this.updateSiren(value, false, false, callback);
};

// Server
SecuritySystem.prototype.isAuthenticated = function (req, res) {
  // Check if authentication is disabled
  if (options.serverCode === null) {
    return null;
  }

  let code = req.query.code;

  // Check if code sent
  if (code === undefined) {
    this.sendCodeRequiredError(res);
    return false;
  }

  // Check brute force
  if (this.invalidCodeCount >= 5) {
    req.blocked = true;
    this.sendCodeInvalidError(req, res);
    return false;
  }

  const userCode = parseInt(req.query.code);

  if (userCode !== options.serverCode) {
    this.invalidCodeCount++;
    this.sendCodeInvalidError(req, res);
    return false;
  }

  // Reset
  this.invalidCodeCount = 0;

  return true;
};

SecuritySystem.prototype.getDelayParameter = function (req) {
  return req.query.delay === 'true' ? true : false;
};

SecuritySystem.prototype.sendCodeRequiredError = function (res) {
  this.log.info('Code required (Server)');

  const response = {
    'error': true,
    'message': 'Code required',
    'hint': 'Add the \'code\' URL parameter with your security code'
  };

  res.status(401).json(response);
};

SecuritySystem.prototype.sendCodeInvalidError = function (req, res) {
  const response = { 'error': true };

  if (req.blocked) {
    this.log.info('Code blocked (Server)');
    response.message = 'Code blocked';
  }
  else {
    this.log.info('Code invalid (Server)');
    response.message = 'Code invalid';
  }

  res.status(403).json(response);
};

SecuritySystem.prototype.sendResultResponse = function (res, sucess) {
  const response = {
    'error': sucess ? false : true
  };

  res.json(response);
};

SecuritySystem.prototype.startServer = async function () {
  app.get('/', (req, res) => {
    res.redirect('https://github.com/MiguelRipoll23/homebridge-securitysystem/wiki/Server');
  });

  app.get('/status', (req, res) => {
    if (this.isAuthenticated(req, res) === false) {
      return;
    }

    const response = {
      'arming': this.isArming,
      'current_mode': this.state2Mode(this.currentState),
      'target_mode': this.state2Mode(this.targetState),
      'sensor_triggered': this.triggerTimeout !== null
    };

    res.json(response);
  });

  app.get('/triggered', (req, res) => {
    if (this.isAuthenticated(req, res) === false) {
      return;
    }

    let sucess = true;

    if (this.getDelayParameter(req)) {
      // Delay
      sucess = this.updateSiren(true, true, false, null);
    }
    else {
      // Instant
      if (this.currentState === Characteristic.SecuritySystemCurrentState.DISARMED && options.overrideOff === false) {
        this.sendResultResponse(res, false);
        return;
      }

      this.handleStateUpdate(true);
      this.setCurrentState(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED, true);
    }

    this.sendResultResponse(res, sucess);
  });

  app.get('/home', (req, res) => {
    if (this.isAuthenticated(req, res) === false) {
      return;
    }

    const state = Characteristic.SecuritySystemTargetState.STAY_ARM;
    const delay = this.getDelayParameter(req);
    const sucess = this.updateTargetState(state, true, delay, null);

    this.sendResultResponse(res, sucess);
  });

  app.get('/away', (req, res) => {
    if (this.isAuthenticated(req, res) === false) {
      return;
    }

    const state = Characteristic.SecuritySystemTargetState.AWAY_ARM;
    const delay = this.getDelayParameter(req);
    const sucess = this.updateTargetState(state, true, delay, null);

    this.sendResultResponse(res, sucess);
  });

  app.get('/night', (req, res) => {
    if (this.isAuthenticated(req, res) === false) {
      return;
    }

    const state = Characteristic.SecuritySystemTargetState.NIGHT_ARM;
    const delay = this.getDelayParameter(req);
    const sucess = this.updateTargetState(state, true, delay, null);

    this.sendResultResponse(res, sucess);
  });

  app.get('/off', (req, res) => {
    if (this.isAuthenticated(req, res) === false) {
      return;
    }

    const state = Characteristic.SecuritySystemTargetState.DISARM;
    const delay = this.getDelayParameter(req);
    const sucess = this.updateTargetState(state, true, delay, null);

    this.sendResultResponse(res, sucess);
  });

  app.get('/arming-lock/:value', (req, res) => {
    if (this.isAuthenticated(req, res) === false) {
      return;
    }

    const value = req.params['value'].includes('true');
    const result = this.updateArmingLock(value);

    this.sendResultResponse(res, result);
  });

  // Listener
  const server = app.listen(options.serverPort, error => {
    if (error) {
      this.log.error('Error while starting server.');
      this.log.error(error);
      return;
    }

    this.log.info(`Server (${options.serverPort})`);
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
    this.log.debug(`Sound file not found (${filePath})`);
    return;
  }

  // Arguments
  let commandArguments = ['-loglevel', 'error', '-nodisp', '-i', `${filePath}`];
 
  if (mode === 'triggered') {
    commandArguments.push('-loop');
    commandArguments.push('-1');
  }
  else if ((mode === 'home' || mode === 'night' || mode === 'away') && type === 'target' && options.audioArmingLooped) {
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
    this.log.info(`Command output: ${data}`);
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
      if (response.ok === false) {
        throw new Error(`Status code (${response.status})`);
      }

      this.log.info('Webhook event (Sent)');
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
SecuritySystem.prototype.getSirenSwitch = function (callback) {
  const value = this.sirenSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setSirenSwitch = function (value, callback) {
  this.updateSiren(value, false, false, callback);
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
  const isCurrentStateAlarmTriggered = this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;

  if (value) {
    if (this.currentState === switchRequiredState ||
       (this.targetState === switchRequiredState && isCurrentStateAlarmTriggered)) {
      this.updateSiren(value, false, false, callback);
    }
    else {
      this.log.warn('Sensor (Mode not set)');
      callback('Ignore');
    }
  }
  else {
    this.updateSiren(value, false, false, callback);
  }
};

SecuritySystem.prototype.getSirenHomeSwitch = function (callback) {
  const value = this.sirenHomeSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setSirenHomeSwitch = function (value, callback) {
  this.triggerIfModeSet(Characteristic.SecuritySystemCurrentState.STAY_ARM, value, callback);
};

SecuritySystem.prototype.getSirenAwaySwitch = function (callback) {
  const value = this.sirenAwaySwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setSirenAwaySwitch = function (value, callback) {
  this.triggerIfModeSet(Characteristic.SecuritySystemCurrentState.AWAY_ARM, value, callback);
};

SecuritySystem.prototype.getSirenNightSwitch = function (callback) {
  const value = this.sirenNightSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setSirenNightSwitch = function (value, callback) {
  this.triggerIfModeSet(Characteristic.SecuritySystemCurrentState.NIGHT_ARM, value, callback);
};

// Reset Motion Sensor
SecuritySystem.prototype.getResetMotionDetected = function (callback) {
  const value = this.resetMotionSensorService.getCharacteristic(Characteristic.MotionDetected).value;
  callback(null, value);
};

// Arming Lock Switch
SecuritySystem.prototype.getArmingLockSwitch = function (callback) {
  const value = this.armingLockSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.logArmingLock = function(value) {
  this.log.info(`Arming lock (${(value) ? 'On' : 'Off'})`);
};

SecuritySystem.prototype.updateArmingLock = function(value) {
  this.logArmingLock(value);

  const onCharacteristic = this.armingLockSwitchService.getCharacteristic(Characteristic.On);
  onCharacteristic.updateValue(value);

  return true;
};

SecuritySystem.prototype.setArmingLockSwitch = function (value, callback) {
  this.logArmingLock(value);
  callback(null);
};

// Mode Switches
SecuritySystem.prototype.resetModeSwitches = function () {
  const modeHomeCharacteristicOn = this.modeHomeSwitchService.getCharacteristic(Characteristic.On);
  const modeAwayCharacteristicOn = this.modeAwaySwitchService.getCharacteristic(Characteristic.On);
  const modeNightCharacteristicOn = this.modeNightSwitchService.getCharacteristic(Characteristic.On);
  const modeOffCharacteristicOn = this.modeOffSwitchService.getCharacteristic(Characteristic.On);
  const modeAwayExtendedCharacteristicOn = this.modeAwayExtendedSwitchService.getCharacteristic(Characteristic.On);
  const modePauseCharacteristicOn = this.modePauseSwitchService.getCharacteristic(Characteristic.On);

  if (modeHomeCharacteristicOn.value) {
    modeHomeCharacteristicOn.updateValue(false);
  }

  if (modeAwayCharacteristicOn.value) {
    modeAwayCharacteristicOn.updateValue(false);
  }

  if (modeNightCharacteristicOn.value) {
    modeNightCharacteristicOn.updateValue(false);
  }

  if (modeOffCharacteristicOn.value) {
    modeOffCharacteristicOn.updateValue(false);
  }

  if (modeAwayExtendedCharacteristicOn.value) {
    modeAwayExtendedCharacteristicOn.updateValue(false);
  }
  
  if (modePauseCharacteristicOn.value) {
    modePauseCharacteristicOn.updateValue(false);
  }
};

SecuritySystem.prototype.updateModeSwitches = function () {
  switch (this.targetState) {
    case Characteristic.SecuritySystemTargetState.STAY_ARM:
      this.modeHomeSwitchService.updateCharacteristic(Characteristic.On, true);
      break;

    case Characteristic.SecuritySystemTargetState.AWAY_ARM:
      this.modeAwaySwitchService.updateCharacteristic(Characteristic.On, true);
      break;

    case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
      this.modeNightSwitchService.updateCharacteristic(Characteristic.On, true);
      break;

    case Characteristic.SecuritySystemTargetState.DISARM:
      this.modeOffSwitchService.updateCharacteristic(Characteristic.On, true);
      break;
  }
};

SecuritySystem.prototype.getModeHomeSwitch = function (callback) {
  const value = this.modeHomeSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModeHomeSwitch = function (value, callback) {
  if (value === false) {
    callback('Ignore');
    return;
  }

  this.updateTargetState(Characteristic.SecuritySystemTargetState.STAY_ARM, true, true, null);
  callback(null);
};

SecuritySystem.prototype.getModeAwaySwitch = function (callback) {
  const value = this.modeAwaySwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModeAwaySwitch = function (value, callback) {
  if (value === false) {
    callback('Ignore');
    return;
  }

  this.updateTargetState(Characteristic.SecuritySystemTargetState.AWAY_ARM, true, true, null);
  callback(null);
};

SecuritySystem.prototype.getModeNightSwitch = function (callback) {
  const value = this.modeNightSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModeNightSwitch = function (value, callback) {
  if (value === false) {
    callback('Ignore');
    return;
  }

  this.updateTargetState(Characteristic.SecuritySystemTargetState.NIGHT_ARM, true, true, null);
  callback(null);
};

SecuritySystem.prototype.getModeOffSwitch = function (callback) {
  const value = this.modeOffSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModeOffSwitch = function (value, callback) {
  if (value === false) {
    callback('Ignore');
    return;
  }

  this.updateTargetState(Characteristic.SecuritySystemTargetState.DISARM, true, true, null);
  callback(null);
};

SecuritySystem.prototype.getModeAwayExtendedSwitch = function (callback) {
  const value = this.modeAwayExtendedSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModeAwayExtendedSwitch = function (value, callback) {
  if (value === false) {
    callback('Ignore');
    return;
  }

  this.updateTargetState(Characteristic.SecuritySystemTargetState.AWAY_ARM, true, true, null);  
  callback(null);
};

SecuritySystem.prototype.getModePauseSwitch = function (callback) {
  const value = this.modePauseSwitchService.getCharacteristic(Characteristic.On).value;
  callback(null, value);
};

SecuritySystem.prototype.setModePauseSwitch = function (value, callback) {
  if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    this.log.warn('Pause (Alarm triggered)');
    callback('Ignore');
    return;
  }

  if (value) {
    if (this.currentState === Characteristic.SecuritySystemCurrentState.DISARMED) {
      this.log.warn('Pause (Not armed)');
      callback('Ignore');
      return;
    }

    this.log.info('Pause (Started)');

    this.pausedCurrentState = this.currentState;
    this.updateTargetState(Characteristic.SecuritySystemTargetState.DISARM, true, true, null);

    // Check if time is set to unlimited
    if (options.pauseMinutes !== 0) {
      this.pauseTimeout = setTimeout(() => {
        this.log.info('Pause (Finished)');
        this.updateTargetState(this.pausedCurrentState, true, true, null);
      }, options.pauseMinutes * 60 * 1000);
    }
  }
  else {
    this.log.info('Pause (Cancelled)');

    if (this.pauseTimeout !== null) {
      clearTimeout(this.pauseTimeout);
      this.pauseTimeout = null;
    }

    this.updateTargetState(this.pausedCurrentState, true, true, null);
  }

  callback(null);
};
