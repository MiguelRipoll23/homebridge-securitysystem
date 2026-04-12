import type { Logging } from 'homebridge';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import { DEFAULTS } from '../constants/default-constant.js';

type RawConfig = Record<string, unknown>;

function isSet(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false; 
  }
  if (typeof value === 'string' && (value.trim() === '' || value === 'null')) {
    return false; 
  }
  return true;
}

function str(raw: RawConfig, key: string): string | null {
  return isSet(raw[key]) ? String(raw[key]) : null;
}

function num(raw: RawConfig, key: string): number | null {
  const v = raw[key];
  if (!isSet(v)) {
    return null; 
  }
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function bool(raw: RawConfig, key: string, def: boolean): boolean {
  return isSet(raw[key]) ? Boolean(raw[key]) : def;
}

function strArr(raw: RawConfig, key: string): string[] {
  return Array.isArray(raw[key]) ? (raw[key] as unknown[]).map(String) : [];
}

/** Migrate deprecated config keys to their current equivalents. */
function applyDeprecations(log: Logging, raw: RawConfig): void {
  const renames: Record<string, string> = {
    siren_switch: 'trip_switch',
    siren_override_switch: 'trip_override_switch',
    siren_mode_switches: 'trip_mode_switches',
    siren_sensor: 'triggered_sensor',
    siren_sensor_seconds: 'triggered_sensor_seconds',
  };

  for (const [oldKey, newKey] of Object.entries(renames)) {
    if (isSet(raw[oldKey]) && !isSet(raw[newKey])) {
      log.warn(`Config: '${oldKey}' is deprecated, use '${newKey}' instead.`);
      raw[newKey] = raw[oldKey];
    }
  }
}

function validate(log: Logging, opts: SecuritySystemOptions): void {
  if (opts.resetMinutes === 0) {
    log.error('\'reset_minutes\' must be at least 1. Defaulting to 1.');
    opts.resetMinutes = 1;
  }

  if (opts.serverPort !== null && (opts.serverPort < 0 || opts.serverPort > 65535)) {
    log.error('\'server_port\' must be between 0 and 65535.');
  }
}

function normalize(opts: SecuritySystemOptions): void {
  opts.defaultMode = opts.defaultMode.toLowerCase();

  if (opts.testMode) {
    opts.webhookCurrentTriggered = null;
    opts.commandCurrentTriggered = null;
  }
}

/** Parse, validate and normalise raw homebridge config into a typed options object. */
export function parseOptions(log: Logging, raw: RawConfig): SecuritySystemOptions {
  log.info('Config', JSON.stringify(raw));
  applyDeprecations(log, raw);

  const opts: SecuritySystemOptions = {
    name: str(raw, 'name') ?? DEFAULTS.NAME,
    serialNumber: str(raw, 'serial_number') ?? DEFAULTS.SERIAL_NUMBER,
    defaultMode: str(raw, 'default_mode') ?? DEFAULTS.DEFAULT_MODE,
    armSeconds: num(raw, 'arm_seconds') ?? DEFAULTS.ARM_SECONDS,
    triggerSeconds: num(raw, 'trigger_seconds') ?? DEFAULTS.TRIGGER_SECONDS,
    resetMinutes: num(raw, 'reset_minutes') ?? DEFAULTS.RESET_MINUTES,
    saveState: bool(raw, 'save_state', false),
    proxyMode: bool(raw, 'proxy_mode', false),
    testMode: bool(raw, 'test_mode', false),

    // Names
    tripSwitchName: str(raw, 'trip_switch_name') ?? DEFAULTS.TRIP_SWITCH_NAME,
    tripHomeSwitchName: str(raw, 'trip_home_switch_name') ?? DEFAULTS.TRIP_HOME_SWITCH_NAME,
    tripAwaySwitchName: str(raw, 'trip_away_switch_name') ?? DEFAULTS.TRIP_AWAY_SWITCH_NAME,
    tripNightSwitchName: str(raw, 'trip_night_switch_name') ?? DEFAULTS.TRIP_NIGHT_SWITCH_NAME,
    tripOverrideSwitchName: str(raw, 'trip_override_switch_name') ?? DEFAULTS.TRIP_OVERRIDE_SWITCH_NAME,
    modeHomeSwitchName: str(raw, 'mode_home_switch_name') ?? DEFAULTS.MODE_HOME_SWITCH_NAME,
    modeAwaySwitchName: str(raw, 'mode_away_switch_name') ?? DEFAULTS.MODE_AWAY_SWITCH_NAME,
    modeNightSwitchName: str(raw, 'mode_night_switch_name') ?? DEFAULTS.MODE_NIGHT_SWITCH_NAME,
    modeOffSwitchName: str(raw, 'mode_off_switch_name') ?? DEFAULTS.MODE_OFF_SWITCH_NAME,
    modeAwayExtendedSwitchName: str(raw, 'mode_away_extended_switch_name') ?? DEFAULTS.MODE_AWAY_EXTENDED_SWITCH_NAME,
    modePauseSwitchName: str(raw, 'mode_pause_switch_name') ?? DEFAULTS.MODE_PAUSE_SWITCH_NAME,
    audioSwitchName: str(raw, 'audio_switch_name') ?? DEFAULTS.AUDIO_SWITCH_NAME,

    // Behaviour
    logDirectory: str(raw, 'log_directory'),
    overrideOff: bool(raw, 'override_off', false),
    resetOffFlow: bool(raw, 'reset_off_flow', false),
    disabledModes: strArr(raw, 'disabled_modes'),

    // Arm delays
    homeArmSeconds: num(raw, 'home_arm_seconds'),
    awayArmSeconds: num(raw, 'away_arm_seconds'),
    nightArmSeconds: num(raw, 'night_arm_seconds'),

    // Trigger delays
    homeTriggerSeconds: num(raw, 'home_trigger_seconds'),
    awayTriggerSeconds: num(raw, 'away_trigger_seconds'),
    nightTriggerSeconds: num(raw, 'night_trigger_seconds'),

    // Trip switches
    tripSwitch: bool(raw, 'trip_switch', false),
    tripOverrideSwitch: bool(raw, 'trip_override_switch', false),
    tripModeSwitches: bool(raw, 'trip_mode_switches', true),

    // Arming lock
    armingLockSwitch: bool(raw, 'arming_lock_switch', false),
    armingLockSwitches: bool(raw, 'arming_lock_switches', false),

    // Sensors
    armingMotionSensor: bool(raw, 'arming_sensor', false),
    trippedMotionSensor: bool(raw, 'tripped_sensor', false),
    trippedMotionSensorSeconds: num(raw, 'tripped_sensor_seconds') ?? DEFAULTS.TRIPPED_SENSOR_SECONDS,
    triggeredMotionSensor: bool(raw, 'triggered_sensor', false),
    triggeredMotionSensorSeconds: num(raw, 'triggered_sensor_seconds') ?? DEFAULTS.TRIGGERED_SENSOR_SECONDS,
    resetSensor: bool(raw, 'reset_sensor', false),

    // Mode switches
    modeSwitches: bool(raw, 'mode_switches', false),
    modeOffSwitch: bool(raw, 'mode_off_switch', false),
    modePauseSwitch: bool(raw, 'mode_pause_switch', false),
    pauseMinutes: num(raw, 'pause_minutes') ?? DEFAULTS.PAUSE_MINUTES,
    modeAwayExtendedSwitch: bool(raw, 'mode_away_extended_switch', false),
    modeAwayExtendedSwitchTriggerSeconds: num(raw, 'mode_away_extended_switch_trigger_seconds'),

    // Double-knock
    doubleKnock: bool(raw, 'double_knock', false),
    doubleKnockSeconds: num(raw, 'double_knock_seconds') ?? DEFAULTS.DOUBLE_KNOCK_SECONDS,
    doubleKnockModes: strArr(raw, 'double_knock_modes'),
    homeDoubleKnockSeconds: num(raw, 'home_double_knock_seconds'),
    awayDoubleKnockSeconds: num(raw, 'away_double_knock_seconds'),
    nightDoubleKnockSeconds: num(raw, 'night_double_knock_seconds'),

    // Audio
    audio: bool(raw, 'audio', false),
    audioPath: str(raw, 'audio_path'),
    audioLanguage: str(raw, 'audio_language') ?? DEFAULTS.AUDIO_LANGUAGE,
    audioVolume: num(raw, 'audio_volume'),
    audioArmingLooped: bool(raw, 'audio_arming_looped', false),
    audioAlertLooped: bool(raw, 'audio_alert_looped', false),
    audioExtraVariables: Array.isArray(raw.audio_extra_variables)
      ? (raw.audio_extra_variables as { key: string; value: string }[])
      : [],
    audioSwitch: bool(raw, 'audio_switch', false),

    // Server
    serverPort: num(raw, 'server_port'),
    serverCode: num(raw, 'server_code'),

    // Commands
    commandTargetHome: str(raw, 'command_target_home'),
    commandTargetAway: str(raw, 'command_target_away'),
    commandTargetNight: str(raw, 'command_target_night'),
    commandTargetOff: str(raw, 'command_target_off'),
    commandCurrentHome: str(raw, 'command_current_home'),
    commandCurrentAway: str(raw, 'command_current_away'),
    commandCurrentNight: str(raw, 'command_current_night'),
    commandCurrentOff: str(raw, 'command_current_off'),
    commandCurrentWarning: str(raw, 'command_current_warning'),
    commandCurrentTriggered: str(raw, 'command_current_triggered'),

    // Webhooks
    webhookUrl: str(raw, 'webhook_url'),
    webhookTargetHome: str(raw, 'webhook_target_home'),
    webhookTargetAway: str(raw, 'webhook_target_away'),
    webhookTargetNight: str(raw, 'webhook_target_night'),
    webhookTargetOff: str(raw, 'webhook_target_off'),
    webhookCurrentHome: str(raw, 'webhook_current_home'),
    webhookCurrentAway: str(raw, 'webhook_current_away'),
    webhookCurrentNight: str(raw, 'webhook_current_night'),
    webhookCurrentOff: str(raw, 'webhook_current_off'),
    webhookCurrentWarning: str(raw, 'webhook_current_warning'),
    webhookCurrentTriggered: str(raw, 'webhook_current_triggered'),
  };

  validate(log, opts);
  normalize(opts);

  log.info('Options', JSON.stringify(opts));
  return opts;
}
