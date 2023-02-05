const options = {
  init: (log, config) => {
    options.checkDeprecated(log, config);

    options.name = config.name;
    options.serialNumber = config.serial_number;
    options.defaultMode = config.default_mode;
    options.armSeconds = config.arm_seconds;
    options.triggerSeconds = config.trigger_seconds;
    options.pauseMinutes = config.pause_minutes;
    options.resetMinutes = config.reset_minutes;
    options.saveState = config.save_state;
    options.proxyMode = config.proxy_mode;
    options.testMode = config.test_mode;

    // Names
    options.securitySystemName = config.security_system_name;
    options.tripSwitchName = config.trip_switch_name;
    options.tripHomeSwitchName = config.trip_home_switch_name;
    options.tripAwaySwitchName = config.trip_away_switch_name;
    options.tripNightSwitchName = config.trip_night_switch_name;
    options.tripOverrideSwitchName = config.trip_override_switch_name;

    options.logDirectory = config.log_directory;
    options.overrideOff = config.override_off;
    options.resetOffFlow = config.reset_off_flow;
    options.disabledModes = config.disabled_modes;

    options.homeArmSeconds = config.home_arm_seconds;
    options.awayArmSeconds = config.away_arm_seconds;
    options.nightArmSeconds = config.night_arm_seconds;

    options.homeTriggerSeconds = config.home_trigger_seconds;
    options.awayTriggerSeconds = config.away_trigger_seconds;
    options.nightTriggerSeconds = config.night_trigger_seconds;

    options.awayExtendedTriggerSeconds = config.away_extended_trigger_seconds;

    // Arming lock switch
    options.armingLockSwitch = config.arming_lock_switch;
    options.armingLockSwitches = config.arming_lock_switches;

    // Trip switches
    options.tripSwitch = config.siren_switch;
    options.tripOverrideSwitch = config.siren_override_switch;
    options.tripModeSwitches = config.siren_mode_switches;

    // Tripped motion sensor
    options.trippedMotionSensor = config.tripped_sensor;
    options.trippedMotionSensorSeconds = config.tripped_sensor_seconds;

    // Triggered motion sensor
    options.triggeredMotionSensor = config.siren_sensor;
    options.triggeredMotionSensorSeconds = config.siren_sensor_seconds;

    // Reset motion sensor
    options.resetSensor = config.reset_sensor;

    // Mode switches
    options.modeSwitches = config.mode_switches;
    options.modeOffSwitch = config.mode_off_switch;
    options.modePauseSwitch = config.mode_pause_switch;
    options.modeAwayExtendedSwitch = config.mode_away_extended_switch;

    // Double knock
    options.doubleKnock = config.double_knock;
    options.doubleKnockSeconds = config.double_knock_seconds;
    options.doubleKnockModes = config.double_knock_modes;

    options.homeDoubleKnockSeconds = config.home_double_knock_seconds;
    options.awayDoubleKnockSeconds = config.away_double_knock_seconds;
    options.nightDoubleKnockSeconds = config.night_double_knock_seconds;

    options.audioSwitch = config.audio_switch;

    // Server
    options.serverPort = config.server_port;
    options.serverCode = config.server_code;

    // Audio
    options.audio = config.audio;
    options.audioPath = config.audio_path;
    options.audioLanguage = config.audio_language;
    options.audioVolume = config.audio_volume;
    options.audioArmingLooped = config.audio_arming_looped;
    options.audioAlertLooped = config.audio_alert_looped;
    options.audioExtraVariables = config.audio_extra_variables;

    // Commands
    options.commandTargetHome = config.command_target_home;
    options.commandTargetAway = config.command_target_away;
    options.commandTargetNight = config.command_target_night;
    options.commandTargetOff = config.command_target_off;

    options.commandCurrentHome = config.command_current_home;
    options.commandCurrentAway = config.command_current_away;
    options.commandCurrentNight = config.command_current_night;
    options.commandCurrentOff = config.command_current_off;
    options.commandCurrentWarning = config.command_current_warning;
    options.commandCurrentTriggered = config.command_current_triggered;

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
    options.webhookCurrentWarning = config.webhook_current_warning;
    options.webhookCurrentTriggered = config.webhook_current_triggered;

    options.setDefaultValues();
    options.validateValues(log);
    options.normalizeValues();
  },

  isValueSet: (value) => {
    if (value === undefined || value === null) {
      // Check empty strings
      if (typeof value === "string" && value.trim() === "") {
        return false;
      }

      return false;
    }

    if (value === "null") {
      return false;
    }

    return true;
  },

  checkDeprecated: (log, config) => {
    // ...
  },

  setDefaultValues: () => {
    if (options.isValueSet(options.name) === false) {
      options.name = "Security System";
    }

    if (options.isValueSet(options.serialNumber) === false) {
      options.serialNumber = "S3CUR1TYSYST3M";
    }

    if (options.isValueSet(options.defaultMode) === false) {
      options.defaultMode = "off";
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

    if (options.isValueSet(options.securitySystemName) === false) {
      options.securitySystemName = "Security System";
    }

    if (options.isValueSet(options.tripSwitchName) === false) {
      options.tripSwitchName = "Trip";
    }

    if (options.isValueSet(options.tripHomeSwitchName) === false) {
      options.tripHomeSwitchName = "Trip Home";
    }

    if (options.isValueSet(options.tripAwaySwitchName) === false) {
      options.tripAwaySwitchName = "Trip Away";
    }

    if (options.isValueSet(options.tripNightSwitchName) === false) {
      options.tripNightSwitchName = "Trip Night";
    }

    if (options.isValueSet(options.tripOverrideSwitchName) === false) {
      options.tripOverrideSwitchName = "Trip Override";
    }

    if (options.isValueSet(options.overrideOff) === false) {
      options.overrideOff = false;
    }

    if (options.isValueSet(options.nightTriggerDelay) === false) {
      options.nightTriggerDelay = true;
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

    if (options.isValueSet(options.logDirectory) === false) {
      options.logDirectory = null;
    }

    // Tripped sensor
    if (options.isValueSet(options.trippedSensor) === false) {
      options.trippedSensor = false;
    }

    if (options.isValueSet(options.trippedSensorSeconds) === false) {
      options.trippedSensorSeconds = 5;
    }

    // Tripped sensor
    if (options.isValueSet(options.trippedMotionSensor) === false) {
      options.trippedMotionSensor = false;
    }

    if (options.isValueSet(options.triggeredMotionSensorSeconds) === false) {
      options.triggeredMotionSensorSeconds = 5;
    }

    // Arming lock switch
    if (options.isValueSet(options.armingLockSwitch) === false) {
      options.armingLockSwitch = false;
    }

    // Trip switches
    if (options.isValueSet(options.tripSwitch) === false) {
      options.tripSwitch = false;
    }

    if (options.isValueSet(options.tripOverrideSwitch) === false) {
      options.tripOverrideSwitch = false;
    }

    if (options.isValueSet(options.tripModeSwitches) === false) {
      options.tripModeSwitches = true;
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

    if (options.isValueSet(options.modeAwayExtendedSwitch) === false) {
      options.modeAwayExtendedSwitch = false;
    }

    if (options.isValueSet(options.pauseMinutes) === false) {
      options.pauseMinutes = 0;
    }

    // Double knock
    if (options.isValueSet(options.doubleKnock) === false) {
      options.doubleKnock = false;
    }

    if (options.isValueSet(options.doubleKnockSeconds) === false) {
      options.doubleKnockSeconds = 90;
    }

    if (options.isValueSet(options.doubleKnockModes) === false) {
      options.doubleKnockModes = ["Away"];
    }

    // Audio
    if (options.isValueSet(options.audio) === false) {
      options.audio = false;
    }

    if (options.isValueSet(options.audioLanguage) === false) {
      options.audioLanguage = "en-US";
    }

    if (options.isValueSet(options.audioArmingLooped) === false) {
      options.audioArmingLooped = false;
    }

    if (options.isValueSet(options.audioAlertLooped) === false) {
      options.audioAlertLooped = false;
    }

    if (options.isValueSet(options.audioExtraVariables) === false) {
      options.audioExtraVariables = [];
    }

    // Server
    if (options.isValueSet(options.serverCode) === false) {
      options.serverCode = null;
    }
  },

  validateValues: (log) => {
    if (options.resetMinutes === 0) {
      log.error("Value of setting 'Reset Delay Seconds' should be at least 1.");
      options.resetMinutes = 1;
    }

    if (options.serverPort < 0 || options.serverPort > 65535) {
      log.error("Value of setting 'Server Port' not between 0 and 65535.");
    }
  },

  normalizeValues: () => {
    options.defaultMode = options.defaultMode.toLowerCase();

    if (options.testMode) {
      options.webhookTriggered = null;
      options.commandTriggered = null;
    }
  },
};

module.exports = options;
