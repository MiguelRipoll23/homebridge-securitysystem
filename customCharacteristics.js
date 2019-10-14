const inherits = require('util').inherits;

function CustomCharacteristic(Characteristic) {
  this.SecuritySystemArmingState = function() {
    this.UUID = '00003005-0000-1000-8000-135D67EC4377';

    Characteristic.call(this, 'Security System Arming State', this.UUID);

    this.STAY_ARM = 0;
    this.AWAY_ARM = 1;
    this.NIGHT_ARM = 2;
    this.DISARM = 3;
    
    this.setProps({
      format: Characteristic.Formats.UINT8,
      maxValue: 3,
      minValue: 0,
      validValues: [0, 1, 2, 3],
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
    });
    this.value = this.getDefaultValue();
  };
  
  inherits(this.SecuritySystemArmingState, Characteristic);

  this.SecuritySystemSirenActive = function() {
    this.UUID = '00003006-0000-1000-8000-135D67EC4377';

    Characteristic.call(this, 'Security System Siren', this.UUID);

    this.setProps({
      format: Characteristic.Formats.BOOL,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
    });

    this.value = this.getDefaultValue();
  };

  inherits(this.SecuritySystemSirenActive, Characteristic);

  return this;
}

module.exports.CustomCharacteristic = CustomCharacteristic;