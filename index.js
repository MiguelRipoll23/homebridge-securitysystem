const fetch = require('node-fetch');
const storage = require('node-persist');
const packageJson = require('./package.json');

let Service, Characteristic;
let homebridgePersistPath;

let remote = false;
let armingTimeout = null;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridgePersistPath = homebridge.user.persistPath();

  homebridge.registerAccessory('homebridge-securitysystem', 'Security system', SecuritySystem);
};

function SecuritySystem(log, config) {
  this.log = log;
  this.name = config.name;
  this.defaultState = config.default_mode;
  this.armSeconds = config.arm_seconds;
  this.triggerSeconds = config.trigger_seconds;
  this.saveState = config.save_state;

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

  if (this.saveState === undefined) {
    this.saveState = false;
  }

  if (config.url !== undefined) {
    remote = true;

    this.url = config.url;
    this.pathHome = config.path_home;
    this.pathAway = config.path_away;
    this.pathNight = config.path_night;
    this.pathOff = config.path_off;
    this.pathTriggered = config.path_triggered;
  }

  // Log options value
  this.logState('Default', this.defaultState);
  this.log('Arm delay (' + this.armSeconds + ' second/s)');
  this.log('Trigger delay (' + this.armSeconds + ' second/s)');

  if (remote) {
    this.log('Webhooks (' + this.url + ')');
  }

  // Variables
  this.triggerTimeout = null;
  this.recoverState = false;

  // Security system
  this.service = new Service.SecuritySystem(this.name);

  this.service
    .getCharacteristic(Characteristic.SecuritySystemTargetState)
    .on('get', this.getTargetState.bind(this))
    .on('set', this.setTargetState.bind(this));

  this.service
    .getCharacteristic(Characteristic.SecuritySystemCurrentState)
    .on('get', this.getCurrentState.bind(this));

  this.currentState = this.defaultState;
  this.targetState = this.defaultState;

  // Switch
  this.switchService = new Service.Switch('Siren');

  this.switchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getSwitchState.bind(this))
    .on('set', this.setSwitchState.bind(this));

  this.on = false;

  // Accessory information
  this.accessoryInformationService = new Service.AccessoryInformation();

  this.accessoryInformationService.setCharacteristic(Characteristic.Identify, true);
  this.accessoryInformationService.setCharacteristic(Characteristic.Manufacturer, 'MiguelRipoll23');
  this.accessoryInformationService.setCharacteristic(Characteristic.Model, 'Generic');
  this.accessoryInformationService.setCharacteristic(Characteristic.Name, 'homebridge-securitysystem');
  this.accessoryInformationService.setCharacteristic(Characteristic.SerialNumber, 'Generic');
  this.accessoryInformationService.setCharacteristic(Characteristic.FirmwareRevision, packageJson.version);

  // Storage
  if (this.saveState) {
    this.load();
  }
}

SecuritySystem.prototype.load = async function() {
  const options = {
    'dir': homebridgePersistPath
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
        return
      }

      this.log('State (Saved)');

      this.currentState = state.currentState;
      this.targetState = state.targetState;
      this.on = state.on;
    })
    .catch(error => {
      this.log('Unable to load state.');
      this.log(error);
    });
};

SecuritySystem.prototype.save = async function() {
  const state = {
    'currentState': this.currentState,
    'targetState': this.targetState,
    'on': this.on
  };

  if (storage.defaultInstance === undefined) {
    return;
  }

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
SecuritySystem.prototype.getCurrentState = function(callback) {
  callback(null, this.currentState);
};

SecuritySystem.prototype.updateCurrentState = function(state, proxied) {
  if (remote && proxied === false) {
    this.updateStateRemotely(state);
    return;
  }

  this.currentState = state;
  this.service.setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
  this.logState('Current', state);

  // Save state to file
  if (this.saveState) {
    this.save();
  }
};

SecuritySystem.prototype.updateStateRemotely = function(state) {
  let path = null;

  switch(state) {
    case Characteristic.SecuritySystemCurrentState.STAY_ARM:
      path = this.pathHome;
      break;

    case Characteristic.SecuritySystemCurrentState.AWAY_ARM:
      path = this.pathAway;
      break;

    case Characteristic.SecuritySystemCurrentState.NIGHT_ARM:
      path = this.pathNight;
      break;

    case Characteristic.SecuritySystemCurrentState.DISARMED:
      path = this.pathOff;
      break;

    case Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED:
      path = this.pathTriggered;
      break;
  }

  if (path === undefined || path === null) {
    this.log('Missing web server path for target state.');
    return;
  }

  // Send GET request to server
  const that = this;

  fetch(this.url + path)
    .then(response => {
      if (!response.ok) {
        throw new Error('Status code (' + response.statusCode + ')');
      }

      that.updateCurrentState(state, true);
    })
    .catch(error => {
      that.log('Request to web server failed. (' + path + ')');
      that.log(error);
    });
}

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

  if (state !== Characteristic.SecuritySystemTargetState.ALARM_TRIGGERED) {
    // Set security system to mode
    // selected from the user
    // during triggered state
    if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
      this.recoverState = true;
    }

    // Cancel pending or triggered alarm
    // if switching to a mode
    if (this.on) {
      this.on = false;
      this.switchService.setCharacteristic(Characteristic.On, this.on);
    }
  }

  // Clear pending mode change
  if (armingTimeout !== null) {
    clearTimeout(armingTimeout);
  }

  // Update current state
  let armSeconds = 0;

  // Add arm delay if alarm is not triggered
  if (this.currentState !== Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    // Only if set to a mode except off
    if (state !== Characteristic.SecuritySystemCurrentState.DISARMED) {
      armSeconds = this.armSeconds;
    }
  }

  armingTimeout = setTimeout(function() {
    this.updateCurrentState(state, false);
  }.bind(this), armSeconds * 1000);

  callback(null);
};

// Switch
SecuritySystem.prototype.getSwitchState = function(callback) {
  callback(null, this.on);
};

SecuritySystem.prototype.setSwitchState = function(state, callback) {
  this.on = state;

  // Save state to file
  if (this.saveState) {
    this.save();
  }

  // Ignore if security system's
  // mode is off
  if (this.currentState === Characteristic.SecuritySystemCurrentState.DISARMED) {
    callback(null);
    return;
  }

  if (state) {
    // On
    if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
      // Ignore since alarm
      // is already triggered
    }
    else {
      this.log('Trigger timeout (Started)');

      this.triggerTimeout = setTimeout(function() {
        this.updateCurrentState(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED, false);
        this.triggerTimeout = null;
        this.recoverState = false;
      }.bind(this), this.triggerSeconds * 1000);
    }
  }
  else {
    // Off
    if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
      if (this.recoverState === false) {
        this.service.setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.DISARMED);
      }
    }
    else if (this.triggerTimeout !== null) {
      clearTimeout(this.triggerTimeout);
      this.triggerTimeout = null;

      this.log('Trigger timeout (Cancelled)');
    }
  }

  callback(null);
};

SecuritySystem.prototype.getServices = function() {
  return [
    this.service,
    this.switchService,
    this.accessoryInformationService
  ];
};
