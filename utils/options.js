const options = { 
  name: null,
  defaultMode: null,
  disabledModes: null,
  armSeconds: null,
  triggerSeconds: null,
  pauseMinutes: null,
  resetMinutes: null,
  overrideOff: null,
  testMode: null,

  // Siren switches
  sirenSwitch: null,
  sirenModeSwitches: null,

  // Mode switches
  modeSwitches: null,
  hideModeOffSwitch: null,
  showModePauseSwitch: null,

  // Siren sensor
  sirenSensor: null,
  sirenSensorSeconds: null,

  // Audio
  audio: null,
  audioPath: null,
  audioLanguage: null,
  audioAlertLooped: null,
  saveState: null,

  // Server
  serverPort: null,
  serverCode: null,

  // Commands
  commandTargetHome: null,
  commandTargetAway: null,
  commandTargetNight: null,
  commandTargetOff: null,

  commandCurrentHome: null,
  commandCurrentAway: null,
  commandCurrentNight: null,
  commandCurrentOff: null,
  commandAlert: null,
  commandTriggered: null,

  // Webhook
  webhookUrl: null,

  webhookTargetHome: null,
  webhookTargetAway: null,
  webhookTargetNight: null,
  webhookTargetOff: null,

  webhookCurrentHome: null,
  webhookCurrentAway: null,
  webhookCurrentNight: null,
  webhookCurrentOff: null,
  webhookAlert: null,
  webhookTriggered: null,

  init: (log, config) => {
    options.checkDeprecated(log, config);

    options.name = config.name;
    options.defaultMode = config.default_mode;
    options.disabledModes = config.disabled_modes;
    options.armSeconds = config.arm_seconds;
    options.triggerSeconds = config.trigger_seconds;
    options.pauseMinutes = config.pause_minutes,
    options.resetMinutes = config.reset_minutes,
    options.overrideOff = config.override_off;
    options.saveState = config.save_state;
    options.testMode = config.test_mode;

    // Siren switches
    options.sirenSwitch = config.siren_switch;
    options.sirenModeSwitches = config.siren_mode_switches;

    // Siren sensor
    options.sirenSensor = config.siren_sensor;
    options.sirenSensorSeconds = config.siren_sensor_seconds;

    // Mode switches
    options.modeSwitches = config.unsafe_mode_switches;
    options.hideModeOffSwitch = config.hide_mode_off_switch;
    options.showModePauseSwitch = config.show_mode_pause_switch;

    // Server
    options.serverPort = config.server_port;
    options.serverCode = config.server_code;

    // Audio
    options.audio = config.audio;
    options.audioPath = config.audio_path;
    options.audioLanguage = config.audio_language;
    options.audioVolume = config.audio_volume;
    options.audioAlertLooped = config.audio_alert_looped;

    // Commands
    options.commandTargetHome = config.command_target_home;
    options.commandTargetAway = config.command_target_away;
    options.commandTargetNight = config.command_target_night;
    options.commandTargetOff = config.command_target_off;
  
    options.commandCurrentHome = config.command_current_home;
    options.commandCurrentAway = config.command_current_away;
    options.commandCurrentNight = config.command_current_night;
    options.commandCurrentOff = config.command_current_off || config.command_off;
    options.commandAlert = config.command_alert;
    options.commandTriggered = config.command_triggered;

    // Webhooks
    options.webhookUrl = config.webhook_url;

    options.webhookTargetHome = config.webhook_target_home;
    options.webhookTargetAway = config.webhook_target_away;
    options.webhookTargetNight = config.webhook_target_night;
    options.webhookTargetOff = config.webhook_target_off;

    options.webhookCurrentHome = config.webhook_current_home;
    options.webhookCurrentAway = config.webhook_current_away;
    options.webhookCurrentNight = config.webhook_current_night;
    options.webhookCurrentOff = config.webhook_current_off || config.webhook_off;
    options.webhookAlert = config.webhook_alert;
    options.webhookTriggered = config.webhook_triggered;

    options.setDefaultValues();
    options.validateValues(log);
    options.normalizeValues();
  },

  isValueSet: (value) => {
    if (value === undefined || value === null) {
      return false;
    }
  
    return true;
  },

  checkDeprecated: (log, config) => {
    if (options.isValueSet(config.command_off)) {
      log.error('Option comand_off has been deprecated, use command_current_off instead.');
    }
  
    if (options.isValueSet(config.webhook_off)) {
      log.error('Option webhook_off has been deprecated, use webhook_current_off instead.');
    }
  },

  setDefaultValues: () => {
    if (options.isValueSet(options.defaultMode) === false) {
      options.defaultMode = 'off';
    }

    if (options.isValueSet(options.disabledModes) === false) {
      options.disabledModes = [];
    }
  
    if (options.isValueSet(options.armSeconds) === false) {
      options.armSeconds = 0;
    }
  
    if (options.isValueSet(options.triggerSeconds) === false) {
      options.triggerSeconds = 0;
    }
  
    if (options.isValueSet(options.resetMinutes) === false) {
      options.resetMinutes = 10;
    }

    if (options.isValueSet(options.overrideOff) === false) {
      options.overrideOff = false;
    }

    if (options.isValueSet(options.saveState) === false) {
      options.saveState = false;
    }

    if (options.isValueSet(options.testMode) === false) {
      options.testMode = false;
    }
  
    // Mode switches
    if (options.isValueSet(options.modeSwitches) === false) {
      options.modeSwitches = false;
    }
  
    if (options.isValueSet(options.hideModeOffSwitch) === false) {
      options.hideModeOffSwitch = false;
    }
  
    if (options.isValueSet(options.showModePauseSwitch) === false) {
      options.showModePauseSwitch = false;
    }
  
    if (options.isValueSet(options.pauseMinutes) === false) {
      options.pauseMinutes = 0;
    }
  
    // Siren switches
    if (options.isValueSet(options.sirenSwitch) === false) {
      options.sirenSwitch = true;
    }

    if (options.isValueSet(options.sirenModeSwitches) === false) {
      options.sirenModeSwitches = false;
    }

    // Siren sensor
    if (options.isValueSet(options.sirenSensor) === false) {
      options.sirenSensor = false;
    }
  
    if (options.isValueSet(options.sirenSensorSeconds) === false) {
      options.sirenSensorSeconds = 5;
    }

    // Audio
    if (options.isValueSet(options.audio) === false) {
      options.audio = false;
    }

    if (options.isValueSet(options.audioLanguage) === false) {
      options.audioLanguage = 'en-US';
    }
  
    if (options.isValueSet(options.audioAlertLooped) === false) {
      options.audioAlertLooped = false;
    }
  },

  validateValues: (log) => {
    if (options.serverPort !== null) {
      if (options.serverPort < 0 || options.serverPort > 65535) {
        log.error('Server port is invalid.');
      }
    }
  },

  normalizeValues: () => {
    options.defaultMode = options.defaultMode.toLowerCase();

    if (options.testMode) {
      options.webhookTriggered = null;
      options.commandTriggered = null;
    }
  }
};

module.exports = options;