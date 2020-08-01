const inherits = require('util').inherits;

function CustomCharacteristic(Characteristic) {
  this.SecuritySystemArming = function() {
    this.UUID = '00003005-0000-1000-8000-135D67EC4377';

    Characteristic.call(this, 'Security System Arming', this.UUID);
    
    this.setProps({
      format: Characteristic.Formats.BOOL,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
    });
    
    this.value = this.getDefaultValue();
  };

  inherits(this.SecuritySystemArming, Characteristic);

  this.SecuritySystemArmingDelay = function() {
    this.UUID = '00003007-0000-1000-8000-135D67EC4377';

    Characteristic.call(this, 'Security System Arming Delay', this.UUID);

    this.setProps({
      format: Characteristic.Formats.BOOL,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
    });

    this.value = true;
  };

  inherits(this.SecuritySystemArmingDelay, Characteristic);

  this.SecuritySystemSiren = function() {
    this.UUID = '00003006-0000-1000-8000-135D67EC4377';

    Characteristic.call(this, 'Security System Siren', this.UUID);

    this.setProps({
      format: Characteristic.Formats.BOOL,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
    });

    this.value = this.getDefaultValue();
  };

  inherits(this.SecuritySystemSiren, Characteristic);

  return this;
}

module.exports.CustomCharacteristic = CustomCharacteristic;