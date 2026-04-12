/**
 * Identifies the source of a state change or trip action.
 */
export enum OriginType {
  REGULAR_SWITCH = 0,
  OVERRIDE_SWITCH = 1,
  INTERNAL = 3,
  EXTERNAL = 4,
}
