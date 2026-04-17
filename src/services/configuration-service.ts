import type { Logging } from 'homebridge';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import { DEFAULTS } from '../constants/default-constant.js';

type RawConfig = Record<string, unknown>;

/**
 * Centralises all configuration parsing, validation, and normalisation.
 * Construct with the raw Homebridge config object; access the fully-typed
 * result via the `options` property.
 */
export class ConfigurationService {
  readonly options: SecuritySystemOptions;

  constructor(private readonly log: Logging, raw: RawConfig) {
    log.info('Config', JSON.stringify(raw));
    this.applyDeprecations(raw);
    this.options = this.parse(raw);
    this.validate(this.options);
    this.normalize(this.options);
    log.info('Options', JSON.stringify(this.options));
  }

  // ── Private parsing helpers ─────────────────────────────────────────────────

  private isSet(value: unknown): boolean {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'string' && (value.trim() === '' || value === 'null')) {
      return false;
    }
    return true;
  }

  private str(raw: RawConfig, key: string): string | null {
    return this.isSet(raw[key]) ? String(raw[key]) : null;
  }

  private num(raw: RawConfig, key: string): number | null {
    const v = raw[key];
    if (!this.isSet(v)) {
      return null;
    }
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  private bool(raw: RawConfig, key: string, def: boolean): boolean {
    return this.isSet(raw[key]) ? Boolean(raw[key]) : def;
  }

  private strArr(raw: RawConfig, key: string): string[] {
    return Array.isArray(raw[key]) ? (raw[key] as unknown[]).map(String) : [];
  }

  // ── Deprecation migration ───────────────────────────────────────────────────

  /** Rewrites deprecated config keys to their current equivalents in-place. */
  private applyDeprecations(raw: RawConfig): void {
    const renames: Record<string, string> = {
      siren_switch: 'trip_switch',
      siren_override_switch: 'trip_override_switch',
      siren_mode_switches: 'trip_mode_switches',
      siren_sensor: 'triggered_sensor',
      siren_sensor_seconds: 'triggered_sensor_seconds',
    };

    for (const [oldKey, newKey] of Object.entries(renames)) {
      if (this.isSet(raw[oldKey]) && !this.isSet(raw[newKey])) {
        this.log.warn(`Config: '${oldKey}' is deprecated, use '${newKey}' instead.`);
        raw[newKey] = raw[oldKey];
      }
    }
  }

  // ── Core parsing ────────────────────────────────────────────────────────────

  private parse(raw: RawConfig): SecuritySystemOptions {
    return {
      name: this.str(raw, 'name') ?? DEFAULTS.NAME,
      serialNumber: this.str(raw, 'serial_number') ?? DEFAULTS.SERIAL_NUMBER,
      defaultMode: this.str(raw, 'default_mode') ?? DEFAULTS.DEFAULT_MODE,
      armSeconds: this.num(raw, 'arm_seconds') ?? DEFAULTS.ARM_SECONDS,
      triggerSeconds: this.num(raw, 'trigger_seconds') ?? DEFAULTS.TRIGGER_SECONDS,
      resetMinutes: this.num(raw, 'reset_minutes') ?? DEFAULTS.RESET_MINUTES,
      saveState: this.bool(raw, 'save_state', false),
      proxyMode: this.bool(raw, 'proxy_mode', false),
      testMode: this.bool(raw, 'test_mode', false),

      // Switch display names
      tripSwitchName: this.str(raw, 'trip_switch_name') ?? DEFAULTS.TRIP_SWITCH_NAME,
      tripHomeSwitchName: this.str(raw, 'trip_home_switch_name') ?? DEFAULTS.TRIP_HOME_SWITCH_NAME,
      tripAwaySwitchName: this.str(raw, 'trip_away_switch_name') ?? DEFAULTS.TRIP_AWAY_SWITCH_NAME,
      tripNightSwitchName: this.str(raw, 'trip_night_switch_name') ?? DEFAULTS.TRIP_NIGHT_SWITCH_NAME,
      tripOverrideSwitchName: this.str(raw, 'trip_override_switch_name') ?? DEFAULTS.TRIP_OVERRIDE_SWITCH_NAME,
      modeHomeSwitchName: this.str(raw, 'mode_home_switch_name') ?? DEFAULTS.MODE_HOME_SWITCH_NAME,
      modeAwaySwitchName: this.str(raw, 'mode_away_switch_name') ?? DEFAULTS.MODE_AWAY_SWITCH_NAME,
      modeNightSwitchName: this.str(raw, 'mode_night_switch_name') ?? DEFAULTS.MODE_NIGHT_SWITCH_NAME,
      modeOffSwitchName: this.str(raw, 'mode_off_switch_name') ?? DEFAULTS.MODE_OFF_SWITCH_NAME,
      modeAwayExtendedSwitchName: this.str(raw, 'mode_away_extended_switch_name') ?? DEFAULTS.MODE_AWAY_EXTENDED_SWITCH_NAME,
      modePauseSwitchName: this.str(raw, 'mode_pause_switch_name') ?? DEFAULTS.MODE_PAUSE_SWITCH_NAME,
      audioSwitchName: this.str(raw, 'audio_switch_name') ?? DEFAULTS.AUDIO_SWITCH_NAME,

      // Behaviour toggles
      logDirectory: this.str(raw, 'log_directory'),
      overrideOff: this.bool(raw, 'override_off', false),
      resetOffFlow: this.bool(raw, 'reset_off_flow', false),
      disabledModes: this.strArr(raw, 'disabled_modes'),

      // Per-mode arm delays
      homeArmSeconds: this.num(raw, 'home_arm_seconds'),
      awayArmSeconds: this.num(raw, 'away_arm_seconds'),
      nightArmSeconds: this.num(raw, 'night_arm_seconds'),

      // Per-mode trigger delays
      homeTriggerSeconds: this.num(raw, 'home_trigger_seconds'),
      awayTriggerSeconds: this.num(raw, 'away_trigger_seconds'),
      nightTriggerSeconds: this.num(raw, 'night_trigger_seconds'),

      // Trip switches
      tripSwitch: this.bool(raw, 'trip_switch', false),
      tripOverrideSwitch: this.bool(raw, 'trip_override_switch', false),
      tripModeSwitches: this.bool(raw, 'trip_mode_switches', true),

      // Arming lock
      armingLockSwitch: this.bool(raw, 'arming_lock_switch', false),
      armingLockSwitches: this.bool(raw, 'arming_lock_switches', false),

      // Motion sensors
      armingMotionSensor: this.bool(raw, 'arming_sensor', false),
      trippedMotionSensor: this.bool(raw, 'tripped_sensor', false),
      trippedMotionSensorSeconds: this.num(raw, 'tripped_sensor_seconds') ?? DEFAULTS.TRIPPED_SENSOR_SECONDS,
      triggeredMotionSensor: this.bool(raw, 'triggered_sensor', false),
      triggeredMotionSensorSeconds: this.num(raw, 'triggered_sensor_seconds') ?? DEFAULTS.TRIGGERED_SENSOR_SECONDS,
      resetSensor: this.bool(raw, 'reset_sensor', false),

      // Mode switches
      modeSwitches: this.bool(raw, 'mode_switches', false),
      modeOffSwitch: this.bool(raw, 'mode_off_switch', false),
      modePauseSwitch: this.bool(raw, 'mode_pause_switch', false),
      pauseMinutes: this.num(raw, 'pause_minutes') ?? DEFAULTS.PAUSE_MINUTES,
      modeAwayExtendedSwitch: this.bool(raw, 'mode_away_extended_switch', false),
      modeAwayExtendedSwitchTriggerSeconds: this.num(raw, 'mode_away_extended_switch_trigger_seconds'),

      // Double-knock
      doubleKnock: this.bool(raw, 'double_knock', false),
      doubleKnockSeconds: this.num(raw, 'double_knock_seconds') ?? DEFAULTS.DOUBLE_KNOCK_SECONDS,
      doubleKnockModes: this.strArr(raw, 'double_knock_modes'),
      homeDoubleKnockSeconds: this.num(raw, 'home_double_knock_seconds'),
      awayDoubleKnockSeconds: this.num(raw, 'away_double_knock_seconds'),
      nightDoubleKnockSeconds: this.num(raw, 'night_double_knock_seconds'),

      // Audio
      audio: this.bool(raw, 'audio', false),
      audioPath: this.str(raw, 'audio_path'),
      audioLanguage: this.str(raw, 'audio_language') ?? DEFAULTS.AUDIO_LANGUAGE,
      audioVolume: this.num(raw, 'audio_volume'),
      audioArmingLooped: this.bool(raw, 'audio_arming_looped', false),
      audioAlertLooped: this.bool(raw, 'audio_alert_looped', false),
      audioExtraVariables: Array.isArray(raw.audio_extra_variables)
        ? (raw.audio_extra_variables as { key: string; value: string }[])
        : [],

      // Custom trip mode switches
      tripHomeSwitches: Array.isArray(raw.trip_home_switches)
        ? (raw.trip_home_switches as { label: string }[])
        : [],
      tripAwaySwitches: Array.isArray(raw.trip_away_switches)
        ? (raw.trip_away_switches as { label: string }[])
        : [],
      tripNightSwitches: Array.isArray(raw.trip_night_switches)
        ? (raw.trip_night_switches as { label: string }[])
        : [],
      audioSwitch: this.bool(raw, 'audio_switch', false),

      // Server
      serverPort: this.num(raw, 'server_port'),
      serverCode: this.num(raw, 'server_code'),

      // Shell commands
      commandTargetHome: this.str(raw, 'command_target_home'),
      commandTargetAway: this.str(raw, 'command_target_away'),
      commandTargetNight: this.str(raw, 'command_target_night'),
      commandTargetOff: this.str(raw, 'command_target_off'),
      commandCurrentHome: this.str(raw, 'command_current_home'),
      commandCurrentAway: this.str(raw, 'command_current_away'),
      commandCurrentNight: this.str(raw, 'command_current_night'),
      commandCurrentOff: this.str(raw, 'command_current_off'),
      commandCurrentWarning: this.str(raw, 'command_current_warning'),
      commandCurrentTriggered: this.str(raw, 'command_current_triggered'),

      // Webhooks
      webhookUrl: this.str(raw, 'webhook_url'),
      webhookTargetHome: this.str(raw, 'webhook_target_home'),
      webhookTargetAway: this.str(raw, 'webhook_target_away'),
      webhookTargetNight: this.str(raw, 'webhook_target_night'),
      webhookTargetOff: this.str(raw, 'webhook_target_off'),
      webhookCurrentHome: this.str(raw, 'webhook_current_home'),
      webhookCurrentAway: this.str(raw, 'webhook_current_away'),
      webhookCurrentNight: this.str(raw, 'webhook_current_night'),
      webhookCurrentOff: this.str(raw, 'webhook_current_off'),
      webhookCurrentWarning: this.str(raw, 'webhook_current_warning'),
      webhookCurrentTriggered: this.str(raw, 'webhook_current_triggered'),
    };
  }

  // ── Post-parse validation ───────────────────────────────────────────────────

  private validate(opts: SecuritySystemOptions): void {
    if (opts.resetMinutes === 0) {
      this.log.error('\'reset_minutes\' must be at least 1. Defaulting to 1.');
      opts.resetMinutes = 1;
    }

    if (opts.serverPort !== null && (opts.serverPort < 0 || opts.serverPort > 65535)) {
      this.log.error('\'server_port\' must be between 0 and 65535.');
    }
  }

  // ── Post-parse normalisation ────────────────────────────────────────────────

  private normalize(opts: SecuritySystemOptions): void {
    opts.defaultMode = opts.defaultMode.toLowerCase();

    if (opts.testMode) {
      opts.webhookCurrentTriggered = null;
      opts.commandCurrentTriggered = null;
    }
  }
}
