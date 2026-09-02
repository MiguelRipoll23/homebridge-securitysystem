import type { FixedMatterSwitchKey, MatterAccessoryKey } from '../types/matter-accessory-key-type.js';
import type { SensorKind } from '../types/sensor-kind-type.js';

/**
 * Stable device-type-indexed identity for every fixed switch, following the
 * Matter convention of `<device-type>-<index>` (e.g. `motion-sensor-1`).
 * The index comes from the fixed slot, so disabling an accessory never
 * renumbers the others.
 */
export const MATTER_SWITCH_IDENTITIES: Record<FixedMatterSwitchKey, string> = {
  // Trip switches
  trip: 'switch-1',
  'trip-home': 'switch-2',
  'trip-away': 'switch-3',
  'trip-night': 'switch-4',
  'trip-override': 'switch-5',
  // Mode switches
  'mode-home': 'switch-6',
  'mode-away': 'switch-7',
  'mode-night': 'switch-8',
  'mode-off': 'switch-9',
  'mode-away-extended': 'switch-10',
  'mode-pause': 'switch-11',
  // Arming lock switches
  'arming-lock': 'switch-12',
  'arming-lock-home': 'switch-13',
  'arming-lock-away': 'switch-14',
  'arming-lock-night': 'switch-15',
};

/** The first index available for custom trip switches. */
export const MATTER_CUSTOM_TRIP_START_INDEX = 16;

/** Stable device-type-indexed identity for each motion sensor. */
export const MATTER_SENSOR_IDENTITIES: Record<SensorKind, string> = {
  arming: 'motion-sensor-1',
  tripped: 'motion-sensor-2',
  reset: 'motion-sensor-3',
};

/** All mode-switch keys, used to push their displayed state to Matter. */
export const MATTER_MODE_SWITCH_KEYS = [
  'mode-home',
  'mode-away',
  'mode-night',
  'mode-off',
  'mode-away-extended',
  'mode-pause',
] as const satisfies readonly MatterAccessoryKey[];

/** All trip-switch keys, used to push their displayed state to Matter. */
export const MATTER_TRIP_SWITCH_KEYS = [
  'trip',
  'trip-home',
  'trip-away',
  'trip-night',
  'trip-override',
] as const satisfies readonly MatterAccessoryKey[];

/** All arming-lock switch keys, used to push their displayed state to Matter. */
export const MATTER_ARMING_LOCK_SWITCH_KEYS = [
  'arming-lock',
  'arming-lock-home',
  'arming-lock-away',
  'arming-lock-night',
] as const satisfies readonly MatterAccessoryKey[];

export const MATTER_MANUFACTURER = 'MiguelRipoll23';
export const MATTER_MODEL = 'Security System (Matter)';