const inherits = require('util').inherits;

function CustomService(Service, Characteristic, CustomCharacteristic) {
  this.SecuritySystem = function (displayName, subtype) {
    this.UUID = '0000007E-0000-1000-8000-0026BB765291';

    Service.call(this, displayName, this.UUID, subtype);

    // Required
    this.addCharacteristic(Characteristic.SecuritySystemCurrentState);
    this.addCharacteristic(Characteristic.SecuritySystemTargetState);

    // Optional
    this.addOptionalCharacteristic(Characteristic.StatusFault);
    this.addOptionalCharacteristic(Characteristic.StatusTampered);
    this.addOptionalCharacteristic(Characteristic.SecuritySystemAlarmType);
    this.addOptionalCharacteristic(Characteristic.Name);

    // Custom
    this.addCharacteristic(CustomCharacteristic.SecuritySystemSiren);
  };

  inherits(this.SecuritySystem, Service);

  return this;
}

module.exports.CustomService = CustomService;
