/** Key-value pair for extra ffplay environment variables. */
export interface AudioVariable {
  key: string;
  value: string;
}

/** A single custom trip switch entry with a user-defined label. */
export interface TripModeSwitch {
  label: string;
}

/** Fully-parsed, strongly-typed configuration options for the security system. */
export interface SecuritySystemOptions {
  name: string;
  serialNumber: string;
  defaultMode: string;
  armSeconds: number;
  triggerSeconds: number;
  resetMinutes: number;
  saveState: boolean;
  proxyMode: boolean;
  testMode: boolean;

  // Switch display names
  tripSwitchName: string;
  tripHomeSwitchName: string;
  tripAwaySwitchName: string;
  tripNightSwitchName: string;
  tripOverrideSwitchName: string;
  modeHomeSwitchName: string;
  modeAwaySwitchName: string;
  modeNightSwitchName: string;
  modeOffSwitchName: string;
  modeAwayExtendedSwitchName: string;
  modePauseSwitchName: string;
  audioSwitchName: string;

  // Behaviour toggles
  logDirectory: string | null;
  overrideOff: boolean;
  resetOffFlow: boolean;
  disabledModes: string[];

  // Per-mode arm delays (null = use global armSeconds)
  homeArmSeconds: number | null;
  awayArmSeconds: number | null;
  nightArmSeconds: number | null;

  // Per-mode trigger delays (null = use global triggerSeconds)
  homeTriggerSeconds: number | null;
  awayTriggerSeconds: number | null;
  nightTriggerSeconds: number | null;

  // Trip switches
  tripSwitch: boolean;
  tripOverrideSwitch: boolean;
  tripModeSwitches: boolean;

  // Custom trip mode switches
  tripHomeSwitches: TripModeSwitch[];
  tripAwaySwitches: TripModeSwitch[];
  tripNightSwitches: TripModeSwitch[];

  // Arming lock
  armingLockSwitch: boolean;
  armingLockSwitches: boolean;

  // Motion sensors
  armingMotionSensor: boolean;
  trippedMotionSensor: boolean;
  trippedMotionSensorSeconds: number;
  triggeredMotionSensor: boolean;
  triggeredMotionSensorSeconds: number;
  resetSensor: boolean;

  // Mode switches
  modeSwitches: boolean;
  modeOffSwitch: boolean;
  modePauseSwitch: boolean;
  pauseMinutes: number;
  modeAwayExtendedSwitch: boolean;
  modeAwayExtendedSwitchTriggerSeconds: number | null;

  // Double-knock
  doubleKnock: boolean;
  doubleKnockSeconds: number;
  doubleKnockModes: string[];
  homeDoubleKnockSeconds: number | null;
  awayDoubleKnockSeconds: number | null;
  nightDoubleKnockSeconds: number | null;

  // Audio
  audio: boolean;
  audioPath: string | null;
  audioLanguage: string;
  audioVolume: number | null;
  audioArmingLooped: boolean;
  audioAlertLooped: boolean;
  audioExtraVariables: AudioVariable[];
  audioSwitch: boolean;

  // Server
  serverPort: number | null;
  serverCode: string | null;

  // Shell commands
  commandTargetHome: string | null;
  commandTargetAway: string | null;
  commandTargetNight: string | null;
  commandTargetOff: string | null;
  commandCurrentHome: string | null;
  commandCurrentAway: string | null;
  commandCurrentNight: string | null;
  commandCurrentOff: string | null;
  commandCurrentWarning: string | null;
  commandCurrentTriggered: string | null;

  // Webhooks
  webhookUrl: string | null;
  webhookTargetHome: string | null;
  webhookTargetAway: string | null;
  webhookTargetNight: string | null;
  webhookTargetOff: string | null;
  webhookCurrentHome: string | null;
  webhookCurrentAway: string | null;
  webhookCurrentNight: string | null;
  webhookCurrentOff: string | null;
  webhookCurrentWarning: string | null;
  webhookCurrentTriggered: string | null;
}
