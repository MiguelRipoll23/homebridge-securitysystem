/** Default configuration values applied when a config property is not set. */
export const DEFAULTS = {
  NAME: 'Security System',
  SERIAL_NUMBER: 'S3CUR1TYSYST3M',
  DEFAULT_MODE: 'off',
  ARM_SECONDS: 0,
  TRIGGER_SECONDS: 0,
  RESET_MINUTES: 10,
  DOUBLE_KNOCK_SECONDS: 90,
  TRIPPED_SENSOR_SECONDS: 5,
  TRIGGERED_SENSOR_SECONDS: 5,
  PAUSE_MINUTES: 0,
  AUDIO_LANGUAGE: 'en-US',

  // Switch display names
  TRIP_SWITCH_NAME: 'Trip',
  TRIP_HOME_SWITCH_NAME: 'Trip Home',
  TRIP_AWAY_SWITCH_NAME: 'Trip Away',
  TRIP_NIGHT_SWITCH_NAME: 'Trip Night',
  TRIP_OVERRIDE_SWITCH_NAME: 'Trip Override',
  MODE_HOME_SWITCH_NAME: 'Mode Home',
  MODE_AWAY_SWITCH_NAME: 'Mode Away',
  MODE_NIGHT_SWITCH_NAME: 'Mode Night',
  MODE_OFF_SWITCH_NAME: 'Mode Off',
  MODE_AWAY_EXTENDED_SWITCH_NAME: 'Mode Away Extended',
  MODE_PAUSE_SWITCH_NAME: 'Mode Pause',
  AUDIO_SWITCH_NAME: 'Audio',
} as const;
