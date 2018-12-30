var packageJson = require('./package.json');
var Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory('homebridge-securitysystem', 'Security system', SecuritySystem);
};

function SecuritySystem(log, config) {
  this.log = log;
  this.name = config.name;
  this.armSeconds = config.arm_seconds;
  this.triggerSeconds = config.trigger_seconds;

  // Check for optional options
  if (this.armSeconds === undefined) {
    this.armSeconds = 0;
  }

  if (this.triggerSeconds === undefined) {
    this.triggerSeconds = 0;
  }

  // Log options value
  this.log('Arm delay (' + this.armSeconds + ' second/s)');
  this.log('Trigger delay (' + this.armSeconds + ' second/s)');

  // Variables
  this.triggerTimeout = null;

  // Security system
  this.service = new Service.SecuritySystem(this.name);

  this.service
    .getCharacteristic(Characteristic.SecuritySystemTargetState)
    .on('get', this.getTargetState.bind(this))
    .on('set', this.setTargetState.bind(this));

  this.service
    .getCharacteristic(Characteristic.SecuritySystemCurrentState)
    .on('get', this.getCurrentState.bind(this));

  this.currentState = Characteristic.SecuritySystemCurrentState.DISARMED;
  this.targetState = Characteristic.SecuritySystemCurrentState.DISARMED;
  this.recoverState = false;

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
}

SecuritySystem.prototype.identify = function(callback) {
  this.log('Identify');
  callback(null);
};

// Security system
SecuritySystem.prototype.getCurrentState = function(callback) {
  callback(null, this.currentState);
};

SecuritySystem.prototype.updateCurrentState = function(state) {
  this.currentState = state;
  this.service.setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
  this.logState('Current', state);
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

SecuritySystem.prototype.getTargetState = function(callback) {
  callback(null, this.targetState);
};

SecuritySystem.prototype.setTargetState = function(state, callback) {
  this.targetState = state;
  this.logState('Target', state);

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

  // Update current state
  var armSeconds = 0;

  // Add arm delay if alarm is not triggered
  if (this.currentState !== Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
    // Only if set to a mode except off
    if (state !== Characteristic.SecuritySystemCurrentState.DISARMED) {
      armSeconds = this.armSeconds;
    }
  }

  setTimeout(function() {
    this.updateCurrentState(state);
    callback(null);
  }.bind(this), armSeconds * 1000);
};

// Switch
SecuritySystem.prototype.getSwitchState = function(callback) {
  callback(null, this.on);
};

SecuritySystem.prototype.setSwitchState = function(state, callback) {
  this.on = state;

  if (state) {
    // On
    if (this.currentState === Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
      // Ignore since alarm
      // is already triggered
    }
    else {
      this.log('Trigger timeout (Started)');

      this.triggerTimeout = setTimeout(function() {
        this.updateCurrentState(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
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
    else {
      if (this.triggerTimeout !== null) {
        clearTimeout(this.triggerTimeout);
        this.triggerTimeout = null;

        this.log('Trigger timeout (Cancelled)');
      }
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
