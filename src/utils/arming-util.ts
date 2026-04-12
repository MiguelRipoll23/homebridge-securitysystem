import { SecurityState } from '../types/security-state-type.js';

/** Subset of SecuritySystemOptions needed for arming delay resolution. */
interface ArmingOptions {
  armSeconds: number;
  homeArmSeconds: number | null;
  awayArmSeconds: number | null;
  nightArmSeconds: number | null;
}

/** Subset of SystemState needed for arming delay resolution. */
interface ArmingState {
  currentState: SecurityState;
}

/**
 * Resolves the arming delay in seconds for the given target state.
 * Returns 0 when disarming (OFF) or when currently triggered.
 * Falls back to the global `armSeconds` when no mode-specific override is set.
 */
export function getArmingSeconds(
  state: ArmingState,
  options: ArmingOptions,
  targetState: SecurityState,
): number {
  const isTriggered = state.currentState === SecurityState.TRIGGERED;
  const isOff = targetState === SecurityState.OFF;

  if (isTriggered || isOff) {
    return 0;
  }

  if (targetState === SecurityState.HOME && options.homeArmSeconds !== null) {
    return options.homeArmSeconds;
  }
  if (targetState === SecurityState.AWAY && options.awayArmSeconds !== null) {
    return options.awayArmSeconds;
  }
  if (targetState === SecurityState.NIGHT && options.nightArmSeconds !== null) {
    return options.nightArmSeconds;
  }

  return options.armSeconds;
}
