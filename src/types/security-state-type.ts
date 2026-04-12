/**
 * Numeric states matching HomeKit's SecuritySystemCurrentState &
 * SecuritySystemTargetState characteristic values.
 */
export enum SecurityState {
  HOME = 0,      // STAY_ARM
  AWAY = 1,      // AWAY_ARM
  NIGHT = 2,     // NIGHT_ARM
  OFF = 3,       // DISARMED / DISARM
  TRIGGERED = 4, // ALARM_TRIGGERED (current state only)
}
