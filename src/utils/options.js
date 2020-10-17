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
    options.armSeconds = config.arm_seconds;
    options.triggerSeconds = config.trigger_seconds;
    options.pauseMinutes = config.pause_minutes;
    options.resetMinutes = config.reset_minutes;
    options.saveState = config.save_state;
    options.proxyMode = config.proxy_mode;
    options.testMode = config.test_mode;

    options.overrideOff = config.override_off;
    options.resetOffFlow = config.reset_off_flow;
    options.disabledModes = config.disabled_modes;

    // Siren switches
    options.sirenSwitch = config.siren_switch;
    options.sirenModeSwitches = config.siren_mode_switches;

    // Siren sensor
    options.sirenSensor = config.siren_sensor;
    options.sirenSensorSeconds = config.siren_sensor_seconds;

    // Reset sensor
    options.resetSensor = config.reset_sensor;

    // Mode switches
    options.modeSwitches = config.mode_switches || config.unsafe_mode_switches;
    options.modeOffSwitch = config.mode_off_switch || !(config.hide_mode_off_switch !== undefined && config.hide_mode_off_switch === true);
    options.modePauseSwitch = config.mode_pause_switch || config.show_mode_pause_switch;

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
    options.commandCurrentOff = config.command_current_off;
    options.commandCurrentWarning = config.command_current_warning || config.command_alert;
    options.commandCurrentTriggered = config.command_current_triggered || config.command_triggered;

    // Webhooks
    options.webhookUrl = config.webhook_url;

    options.webhookTargetHome = config.webhook_target_home;
    options.webhookTargetAway = config.webhook_target_away;
    options.webhookTargetNight = config.webhook_target_night;
    options.webhookTargetOff = config.webhook_target_off;

    options.webhookCurrentHome = config.webhook_current_home;
    options.webhookCurrentAway = config.webhook_current_away;
    options.webhookCurrentNight = config.webhook_current_night;
    options.webhookCurrentOff = config.webhook_current_off;
    options.webhookCurrentWarning = config.webhook_current_warning || config.webhook_alert;
    options.webhookCurrentTriggered = config.webhook_current_triggered || config.webhook_triggered;

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
    if (options.isValueSet(config.hide_mode_off_switch)) {
      log.warn('Option \'hide_mode_off_switch\' has been renamed, update your configuration.');
    }

    if (options.isValueSet(config.unsafe_mode_switches)) {
      log.warn('Option \'unsafe_mode_switches\' has been renamed, update your configuration.');
    }

    if (options.isValueSet(config.show_pause_pause_switch)) {
      log.warn('Option \'show_pause_pause_switch\' has been renamed, update your configuration.');
    }

    if (options.isValueSet(config.command_triggered)) {
      log.warn('Option \'command_triggered\' has been renamed, update your configuration.');
    }

    if (options.isValueSet(config.webhook_triggered)) {
      log.warn('Option \'webhook_triggered\' has been renamed, update your configuration.');
    }

    if (options.isValueSet(config.command_alert)) {
      log.warn('Option \'command_alert\' has been renamed, update your configuration.');
    }

    if (options.isValueSet(config.webhook_alert)) {
      log.warn('Option \'webhook_alert\' has been renamed, update your configuration.');
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

    if (options.isValueSet(options.resetOff) === false) {
      options.resetOff = false;
    }

    if (options.isValueSet(options.saveState) === false) {
      options.saveState = false;
    }

    if (options.isValueSet(options.proxyMode) === false) {
      options.proxyMode = false;
    }

    if (options.isValueSet(options.testMode) === false) {
      options.testMode = false;
    }

    // Siren sensor
    if (options.isValueSet(options.sirenSensor) === false) {
      options.sirenSensor = false;
    }

    if (options.isValueSet(options.sirenSensorSeconds) === false) {
      options.sirenSensorSeconds = 5;
    }

    // Siren switches
    if (options.isValueSet(options.sirenSwitch) === false) {
      options.sirenSwitch = true;
    }

    if (options.isValueSet(options.sirenModeSwitches) === false) {
      options.sirenModeSwitches = false;
    }

    // Reset sensor
    if (options.isValueSet(options.resetSensor) === false) {
      options.resetSensor = false;
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

    // Server
    if (options.isValueSet(options.serverCode) === false) {
      options.serverCode = null;
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
