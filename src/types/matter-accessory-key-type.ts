/**
 * Stable identifier for every Matter accessory the plugin can publish.
 * Custom trip switches carry their mode and index, e.g. `trip-custom-away-0`.
 */
export type MatterAccessoryKey =
  // Trip switches
  | 'trip'
  | 'trip-home'
  | 'trip-away'
  | 'trip-night'
  | 'trip-override'
  | `trip-custom-home-${number}`
  | `trip-custom-away-${number}`
  | `trip-custom-night-${number}`
  // Mode switches
  | 'mode-home'
  | 'mode-away'
  | 'mode-night'
  | 'mode-off'
  | 'mode-away-extended'
  | 'mode-pause'
  // Arming lock switches
  | 'arming-lock'
  | 'arming-lock-home'
  | 'arming-lock-away'
  | 'arming-lock-night'
  // Motion sensors
  | 'sensor-arming'
  | 'sensor-tripped'
  | 'sensor-reset';

/** All fixed switch keys — everything except the dynamic custom trip switches. */
export type FixedMatterSwitchKey = Exclude<MatterAccessoryKey, `trip-custom-${string}` | `sensor-${string}`>;
